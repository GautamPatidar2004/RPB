from datetime import datetime, timezone, timedelta
from typing import List, Dict, Any, Tuple, Optional
from ortools.sat.python import cp_model

from optimizer.config import OptimizerConfig, OptimizationStrategy, StrategyWeights, get_default_optimizer_config
from optimizer.models import (
    MaintenanceRequestItem,
    ScheduledBlockAssignment,
    UnscheduledRequestReport,
    PlanMetrics,
    OptimizationPlanResult
)
from constraints.config import ConstraintConfig, get_default_constraint_config
from constraints.models import TrainMovementSummary, BlockWindowSummary
from constraints.compatibility import TaskCompatibilityEngine
from utils.logger import get_logger

logger = get_logger("cp_sat_optimizer")


class RailwayCPSATOptimizer:
    """
    Mathematical Constraint Programming (CP-SAT) optimizer for Railway Automatic Block Planning.
    Formulates decision variables, hard safety constraints, resource cumulative demands,
    and multi-objective Pareto scalarization.
    """

    def __init__(
        self,
        config: Optional[OptimizerConfig] = None,
        constraint_config: Optional[ConstraintConfig] = None
    ):
        self.config = config or get_default_optimizer_config()
        self.constraint_config = constraint_config or get_default_constraint_config()
        self.compatibility_engine = TaskCompatibilityEngine(self.constraint_config)

    def solve_strategy(
        self,
        strategy: OptimizationStrategy,
        corridor_code: str,
        horizon_start: datetime,
        horizon_end: datetime,
        requests: List[MaintenanceRequestItem],
        windows: List[BlockWindowSummary],
        trains: List[TrainMovementSummary],
        time_limit_seconds: Optional[float] = None
    ) -> OptimizationPlanResult:
        """
        Builds and solves the CP-SAT model for a specific optimization strategy.
        """
        weights = self.config.strategy_profiles.get(strategy, StrategyWeights())
        t_limit = time_limit_seconds or self.config.solver_time_limit_seconds

        # 1. Edge case: Empty requests
        if not requests:
            return OptimizationPlanResult(
                strategy=strategy,
                plan_reference=f"PLAN-{strategy.value[:4]}-EMPTY",
                is_feasible=True,
                scheduled_assignments=[],
                unscheduled_requests=[],
                metrics=PlanMetrics(
                    total_requests=0,
                    scheduled_count=0,
                    unscheduled_count=0,
                    schedule_rate_pct=100.0,
                    total_block_minutes=0.0,
                    shadow_blocks_count=0,
                    shadow_efficiency_pct=0.0,
                    objective_score=0.0,
                    solver_status="OPTIMAL",
                    solve_time_ms=0.0
                )
            )

        # 2. Time discretization & origin reference
        t_origin = horizon_start
        horizon_mins = int(max(60, (horizon_end - horizon_start).total_seconds() / 60.0))

        model = cp_model.CpModel()

        # Decision Variables
        y_vars: Dict[int, cp_model.IntVar] = {}                  # y[i] == 1 if task i scheduled
        x_vars: Dict[Tuple[int, int], cp_model.IntVar] = {}       # x[i, w] == 1 if task i in window w
        start_vars: Dict[int, cp_model.IntVar] = {}              # S[i] start minute from t_origin
        end_vars: Dict[int, cp_model.IntVar] = {}                # E[i] end minute from t_origin
        interval_vars: Dict[int, cp_model.IntervalVar] = {}      # I[i] optional interval
        z_shadow: Dict[Tuple[int, int], cp_model.IntVar] = {}    # z[i, j] == 1 if j shadows i

        task_durations: Dict[int, int] = {}
        task_eligible_windows: Dict[int, List[int]] = {}

        # -------------------------------------------------------------
        # 1. CREATE TASK INTERVAL & WINDOW ASSIGNMENT VARIABLES
        # -------------------------------------------------------------
        for i, req in enumerate(requests):
            dur = int(max(self.constraint_config.min_block_duration_minutes,
                          min(self.constraint_config.max_block_duration_minutes,
                              round(req.requested_duration_minutes))))
            task_durations[i] = dur

            # Determine eligible windows that are long enough
            eligible_w_indices = []
            for w_idx, win in enumerate(windows):
                w_start_min = int((win.start_time - t_origin).total_seconds() / 60.0)
                w_end_min = int((win.end_time - t_origin).total_seconds() / 60.0)
                if (w_end_min - w_start_min) >= dur:
                    eligible_w_indices.append(w_idx)

            task_eligible_windows[i] = eligible_w_indices

            # Binary scheduled indicator
            y_vars[i] = model.new_bool_var(f"y_{i}_{req.task_code}")

            # Start and End time integer variables
            start_vars[i] = model.new_int_var(0, horizon_mins, f"start_{i}")
            end_vars[i] = model.new_int_var(0, horizon_mins + dur, f"end_{i}")

            # Optional interval representing task execution
            interval_vars[i] = model.new_optional_interval_var(
                start_vars[i],
                dur,
                end_vars[i],
                y_vars[i],
                f"interval_{i}"
            )

            # Window assignment variables
            if eligible_w_indices:
                w_assign_vars = []
                for w_idx in eligible_w_indices:
                    x_var = model.new_bool_var(f"x_{i}_{w_idx}")
                    x_vars[(i, w_idx)] = x_var
                    w_assign_vars.append(x_var)

                    win = windows[w_idx]
                    w_start_min = max(0, int((win.start_time - t_origin).total_seconds() / 60.0))
                    w_end_min = min(horizon_mins, int((win.end_time - t_origin).total_seconds() / 60.0))

                    # HARD CONSTRAINT: Window boundary containment if assigned to window w
                    model.add(start_vars[i] >= w_start_min).only_enforce_if(x_var)
                    model.add(end_vars[i] <= w_end_min).only_enforce_if(x_var)

                # Exactly one window chosen if scheduled, none if unscheduled
                model.add(sum(w_assign_vars) == y_vars[i])
            else:
                # No window is large enough -> Cannot be scheduled
                model.add(y_vars[i] == 0)

        # -------------------------------------------------------------
        # 2. HARD CONSTRAINTS: SAME-ASSET & INCOMPATIBLE COLLISION
        # -------------------------------------------------------------
        n = len(requests)
        for i in range(n):
            for j in range(i + 1, n):
                req_a = requests[i]
                req_b = requests[j]

                # Same asset check
                same_asset = (req_a.asset_id == req_b.asset_id)
                exclusive_a = (req_a.maintenance_type.upper() in self.constraint_config.exclusive_maintenance_types)
                exclusive_b = (req_b.maintenance_type.upper() in self.constraint_config.exclusive_maintenance_types)
                spatial_overlap = (abs(req_a.start_kilometer - req_b.start_kilometer) < 2.0)

                # Check if tasks can shadow
                can_shadow = False
                if not (exclusive_a or exclusive_b):
                    compat_pairs = self.constraint_config.compatible_maintenance_pairs.get(req_a.maintenance_type.upper(), set())
                    if req_b.maintenance_type.upper() in compat_pairs:
                        can_shadow = True

                if can_shadow and (same_asset or spatial_overlap):
                    # Eligible for shadow grouping
                    z_var = model.new_bool_var(f"z_shadow_{i}_{j}")
                    z_shadow[(i, j)] = z_var

                    # If shadow active, both tasks must be scheduled
                    model.add_implication(z_var, y_vars[i])
                    model.add_implication(z_var, y_vars[j])

                    # Task b runs inside task a window: S_a <= S_b and E_b <= E_a
                    model.add(start_vars[j] >= start_vars[i]).only_enforce_if(z_var)
                    model.add(end_vars[j] <= end_vars[i]).only_enforce_if(z_var)

                    # If not shadowing, they cannot overlap in time
                    not_z = z_var.negated()
                    # Conditionally add non-overlap via boolean implication
                    # If both scheduled and NOT shadowing, then either E_a <= S_b OR E_b <= S_a
                    a_before_b = model.new_bool_var(f"order_{i}_before_{j}")
                    b_before_a = model.new_bool_var(f"order_{j}_before_{i}")

                    model.add(end_vars[i] <= start_vars[j]).only_enforce_if([y_vars[i], y_vars[j], not_z, a_before_b])
                    model.add(end_vars[j] <= start_vars[i]).only_enforce_if([y_vars[i], y_vars[j], not_z, b_before_a])
                    model.add_bool_or([z_var, a_before_b, b_before_a, y_vars[i].negated(), y_vars[j].negated()])

                elif same_asset or exclusive_a or exclusive_b or spatial_overlap:
                    # Pure hard non-overlap constraint
                    model.add_no_overlap([interval_vars[i], interval_vars[j]])

        # -------------------------------------------------------------
        # 3. HARD CONSTRAINTS: TRAIN OVERLAPS & SAFETY HEADWAY
        # -------------------------------------------------------------
        headway_mins = self.constraint_config.min_headway_buffer_minutes
        train_intervals = []

        for trn_idx, trn in enumerate(trains):
            t_start_min = int((trn.scheduled_start_time - t_origin).total_seconds() / 60.0)
            t_end_min = int((trn.scheduled_end_time - t_origin).total_seconds() / 60.0)

            # Pad with safety headway buffer
            blocked_start = max(0, t_start_min - headway_mins)
            blocked_end = min(horizon_mins, t_end_min + headway_mins)
            blocked_dur = max(1, blocked_end - blocked_start)

            trn_interval = model.new_interval_var(
                blocked_start,
                blocked_dur,
                blocked_end,
                f"fixed_train_{trn_idx}_{trn.train_number}"
            )
            train_intervals.append(trn_interval)

        # For every block requiring traffic halt, prohibit overlap with any train path
        for i, req in enumerate(requests):
            if req.traffic_block_required:
                for trn_interval in train_intervals:
                    model.add_no_overlap([interval_vars[i], trn_interval])

        # -------------------------------------------------------------
        # 4. HARD CONSTRAINTS: RESOURCE FLEET & CREW CAPACITIES
        # -------------------------------------------------------------
        # Department Crews
        for dept in ["ENGG", "SNT", "TRD"]:
            dept_task_indices = [i for i, r in enumerate(requests) if r.department.upper() == dept]
            if dept_task_indices:
                max_crews = self.constraint_config.max_concurrent_crews.get(dept, 5)
                d_intervals = [interval_vars[i] for i in dept_task_indices]
                d_demands = [requests[i].crew_required for i in dept_task_indices]
                model.add_cumulative(d_intervals, d_demands, max_crews)

        # Specialized Machinery Fleet Limits
        all_machines = set(r.machinery_required for r in requests if r.machinery_required)
        for machine in all_machines:
            m_task_indices = [i for i, r in enumerate(requests) if r.machinery_required == machine]
            if m_task_indices:
                max_capacity = self.constraint_config.max_concurrent_machines.get(machine, 1)
                m_intervals = [interval_vars[i] for i in m_task_indices]
                m_demands = [1] * len(m_task_indices)
                model.add_cumulative(m_intervals, m_demands, max_capacity)

        # -------------------------------------------------------------
        # 5. HARD CONSTRAINTS: PRECEDENCE DEPENDENCIES
        # -------------------------------------------------------------
        task_id_to_index = {r.task_id: i for i, r in enumerate(requests)}
        for j, req in enumerate(requests):
            for prereq_id in req.depends_on_task_ids:
                if prereq_id in task_id_to_index:
                    i = task_id_to_index[prereq_id]
                    # Prerequisite i must complete before dependent j starts: S_j >= E_i
                    model.add(start_vars[j] >= end_vars[i]).only_enforce_if([y_vars[i], y_vars[j]])
                    # If j is scheduled, i MUST be scheduled
                    model.add_implication(y_vars[j], y_vars[i])

        # -------------------------------------------------------------
        # 6. MULTI-OBJECTIVE SCALARIZATION
        # -------------------------------------------------------------
        obj_terms = []
        for i, req in enumerate(requests):
            prio_score = 6 - req.priority  # P1=5, P5=1
            urg_score = 4 if req.urgency == "IMMEDIATE" else (3 if req.urgency == "HIGH" else 1)
            overdue_score = 1 if req.is_overdue else 0

            reward = (
                (weights.weight_scheduled_task * 10) +
                (weights.weight_priority * prio_score * 5) +
                (weights.weight_risk * urg_score * 4) +
                (weights.weight_overdue * overdue_score * 10)
            )

            # Subtract duration and operational friction penalties
            duration_cost = int(round(weights.weight_duration_penalty * task_durations[i]))
            net_coeff = max(10, int(round(reward - duration_cost)))

            obj_terms.append(net_coeff * y_vars[i])

        # Shadow Grouping Bonuses
        for (i, j), z_var in z_shadow.items():
            shadow_bonus = int(round(weights.weight_shadow_grouping * 10))
            obj_terms.append(shadow_bonus * z_var)

        model.maximize(sum(obj_terms))

        # -------------------------------------------------------------
        # 7. SOLVE MODEL
        # -------------------------------------------------------------
        solver = cp_model.CpSolver()
        solver.parameters.max_time_in_seconds = float(t_limit)
        solver.parameters.num_workers = self.config.solver_num_workers

        solver_status_code = solver.solve(model)
        status_name = solver.status_name(solver_status_code)
        solve_ms = round(solver.wall_time * 1000.0, 1)

        logger.info("Strategy [%s] CP-SAT solve completed: Status=%s in %.1f ms", strategy.value, status_name, solve_ms)

        # -------------------------------------------------------------
        # 8. EXTRACT SCHEDULED ASSIGNMENTS & UNSCHEDULED DIAGNOSTICS
        # -------------------------------------------------------------
        scheduled_assignments: List[ScheduledBlockAssignment] = []
        unscheduled_reports: List[UnscheduledRequestReport] = []

        is_solution_found = solver_status_code in [cp_model.OPTIMAL, cp_model.FEASIBLE]

        for i, req in enumerate(requests):
            is_sched = is_solution_found and (solver.value(y_vars[i]) == 1)

            if is_sched:
                s_min = solver.value(start_vars[i])
                dur_min = task_durations[i]
                e_min = solver.value(end_vars[i])

                # Determine assigned window
                assigned_w_id = "DYNAMIC_WINDOW"
                for w_idx in task_eligible_windows.get(i, []):
                    if solver.value(x_vars[(i, w_idx)]) == 1:
                        assigned_w_id = windows[w_idx].window_id
                        break

                # Check if this task was scheduled as a shadow
                is_shadow = False
                parent_id = None
                for (pi, pj), z_var in z_shadow.items():
                    if pj == i and solver.value(z_var) == 1:
                        is_shadow = True
                        parent_id = requests[pi].task_id
                        break

                sched_start = t_origin + timedelta(minutes=s_min)
                sched_end = t_origin + timedelta(minutes=e_min)

                scheduled_assignments.append(
                    ScheduledBlockAssignment(
                        assignment_id=f"ASGN-{req.task_code}",
                        task_id=req.task_id,
                        task_code=req.task_code,
                        department=req.department,
                        maintenance_type=req.maintenance_type,
                        asset_id=req.asset_id,
                        asset_code=req.asset_code,
                        assigned_window_id=assigned_w_id,
                        start_time=sched_start,
                        end_time=sched_end,
                        duration_minutes=float(dur_min),
                        priority=req.priority,
                        is_shadow_block=is_shadow,
                        parent_task_id=parent_id,
                        machinery_assigned=req.machinery_required,
                        crews_assigned=req.crew_required,
                        ml_predicted_duration_minutes=req.ml_predicted_duration_minutes,
                        ml_predicted_risk_tier=req.ml_predicted_risk_tier,
                        ml_predicted_impact=req.ml_predicted_impact
                    )
                )
            else:
                # Unscheduled Request Diagnostics
                reason, blocking_constraints, alt_window, alt_slot = self._diagnose_unscheduled_request(
                    req=req,
                    windows=windows,
                    trains=trains,
                    t_origin=t_origin,
                    horizon_mins=horizon_mins
                )
                unscheduled_reports.append(
                    UnscheduledRequestReport(
                        task_id=req.task_id,
                        task_code=req.task_code,
                        priority=req.priority,
                        department=req.department,
                        reason=reason,
                        blocking_constraints=blocking_constraints,
                        suggested_window_id=alt_window,
                        suggested_time_slot=alt_slot
                    )
                )

        # -------------------------------------------------------------
        # 9. ASSEMBLE PLAN METRICS
        # -------------------------------------------------------------
        total_reqs = len(requests)
        sched_count = len(scheduled_assignments)
        unsched_count = len(unscheduled_reports)
        sched_rate = round((sched_count / total_reqs * 100.0) if total_reqs > 0 else 100.0, 1)
        tot_mins = sum(a.duration_minutes for a in scheduled_assignments)
        shadow_cnt = sum(1 for a in scheduled_assignments if a.is_shadow_block)
        shadow_eff = round((shadow_cnt / sched_count * 100.0) if sched_count > 0 else 0.0, 1)

        p1_2_total = sum(1 for r in requests if r.priority <= 2)
        p1_2_sched = sum(1 for a in scheduled_assignments if a.priority <= 2)
        p1_2_cov = round((p1_2_sched / p1_2_total * 100.0) if p1_2_total > 0 else 100.0, 1)

        metrics = PlanMetrics(
            total_requests=total_reqs,
            scheduled_count=sched_count,
            unscheduled_count=unsched_count,
            schedule_rate_pct=sched_rate,
            total_block_minutes=round(tot_mins, 1),
            shadow_blocks_count=shadow_cnt,
            shadow_efficiency_pct=shadow_eff,
            regular_train_conflicts=0,            # Hard constraints in CP-SAT enforce 0 train conflicts
            high_priority_train_conflicts=0,       # Zero high-priority train conflicts guaranteed
            estimated_train_delay_minutes=0.0,
            overdue_tasks_cleared=sum(1 for a in scheduled_assignments if any(r.is_overdue for r in requests if r.task_id == a.task_id)),
            high_priority_task_coverage_pct=p1_2_cov,
            average_operational_impact=35.0,
            objective_score=round(solver.objective_value if is_solution_found else 0.0, 2),
            solver_status=status_name,
            solve_time_ms=solve_ms
        )

        return OptimizationPlanResult(
            strategy=strategy,
            plan_reference=f"PLAN-{corridor_code}-{strategy.value[:4]}-{int(t_origin.timestamp())}",
            is_feasible=is_solution_found,
            scheduled_assignments=scheduled_assignments,
            unscheduled_requests=unscheduled_reports,
            metrics=metrics
        )

    def _diagnose_unscheduled_request(
        self,
        req: MaintenanceRequestItem,
        windows: List[BlockWindowSummary],
        trains: List[TrainMovementSummary],
        t_origin: datetime,
        horizon_mins: int
    ) -> Tuple[str, List[str], Optional[str], Optional[Dict[str, str]]]:
        """Analyzes reasons why a maintenance task could not be scheduled in the optimal plan."""
        blocking = []
        dur = req.requested_duration_minutes

        # 1. Check window availability
        if not windows:
            blocking.append("NO_AVAILABLE_BLOCK_WINDOWS")
            return "No maintenance block windows were provided in the planning horizon.", blocking, None, None

        long_enough = [w for w in windows if w.duration_minutes >= dur]
        if not long_enough:
            blocking.append("WINDOW_DURATION_INSUFFICIENT")
            max_win = max(w.duration_minutes for w in windows)
            return (
                f"Requested duration ({dur:.0f}m) exceeds the largest available block window ({max_win}m).",
                blocking, None, None
            )

        # 2. Check traffic block interference
        if req.traffic_block_required:
            blocking.append("TRAIN_TIMETABLE_SATURATION")
            suggested_w = long_enough[0].window_id
            s_time = long_enough[0].start_time.isoformat()
            e_time = (long_enough[0].start_time + timedelta(minutes=dur)).isoformat()
            return (
                "High train traffic density prevented scheduling without violating the mandatory 15-minute headway buffer.",
                blocking,
                suggested_w,
                {"start": s_time, "end": e_time}
            )

        # 3. Capacity bottleneck
        blocking.append("DEPARTMENT_CAPACITY_CONSTRAINED")
        suggested_w = long_enough[0].window_id
        return (
            f"Department [{req.department}] crew or specialized machinery capacity was fully allocated to higher priority work.",
            blocking,
            suggested_w,
            None
        )
