# core_optimizer.py
from ortools.sat.python import cp_model
import json

def optimize_maintenance_block(section_id, train_schedule, maintenance_requests):
    """
    Core Optimization Engine for Railway Maintenance Block Planning.
    Minimizes passenger and freight disruptions while granting requested work windows.
    """
    model = cp_model.CpModel()
    time_horizon = 1440  # 24 hours in minutes (00:00 to 23:59)
    
    # -------------------------------------------------------------
    # 1. BUNDLE REQUESTS (Departmental Consolidation)
    # -------------------------------------------------------------
    # If multiple departments request the same section, take the maximum duration
    combined_duration = max([req['duration_mins'] for req in maintenance_requests])
    departments_involved = [req['dept'] for req in maintenance_requests]

    # -------------------------------------------------------------
    # 2. DECISION VARIABLES
    # -------------------------------------------------------------
    # When does the block start and end? (in minutes from midnight)
    block_start = model.NewIntVar(0, time_horizon - combined_duration, 'block_start')
    block_end = model.NewIntVar(0, time_horizon, 'block_end')
    
    # Structural Invariant: block_end must equal block_start + duration
    model.Add(block_end == block_start + combined_duration)

    # -------------------------------------------------------------
    # 3. PENALTIES & PRIORITY CONSTRAINTS
    # -------------------------------------------------------------
    conflict_penalties = []
    conflict_flags = {}
    
    # Weight penalties based on train priority
    # Priority 1: Vande Bharat / Rajdhani Express (Heavy disruption cost)
    # Priority 2: Mail / Express / MEMU
    # Priority 3: Goods / Freight
    PRIORITY_WEIGHTS = {1: 1500, 2: 400, 3: 60}

    for train in train_schedule:
        t_id = train['train_id']
        t_min = train['scheduled_minute']
        prio = train['priority']
        
        # Boolean decision variable: 1 if this train overlaps with the block, 0 otherwise
        is_conflicting = model.NewBoolVar(f"conflict_{t_id}")
        conflict_flags[t_id] = is_conflicting
        
        # Train conflicts if its departure falls inside [block_start, block_end]
        model.Add(t_min >= block_start).OnlyEnforceIf(is_conflicting)
        model.Add(t_min <= block_end).OnlyEnforceIf(is_conflicting)
        
        # Calculate penalty weight
        penalty = is_conflicting * PRIORITY_WEIGHTS.get(prio, 100)
        conflict_penalties.append(penalty)

    # -------------------------------------------------------------
    # 4. OBJECTIVE FUNCTION: Minimize Total Disruption Penalty
    # -------------------------------------------------------------
    model.Minimize(sum(conflict_penalties))

    # -------------------------------------------------------------
    # 5. EXECUTE SOLVER
    # -------------------------------------------------------------
    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = 5.0
    status = solver.Solve(model)

    # -------------------------------------------------------------
    # 6. RETURN FORMATTED RESULTS
    # -------------------------------------------------------------
    if status in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        opt_start = solver.Value(block_start)
        opt_end = solver.Value(block_end)

        impacted_trains = []
        for train in train_schedule:
            if solver.Value(conflict_flags[train['train_id']]) == 1:
                impacted_trains.append({
                    "train_name": train['name'],
                    "priority": train['priority'],
                    "scheduled_departure": f"{train['scheduled_minute'] // 60:02d}:{train['scheduled_minute'] % 60:02d}"
                })

        return {
            "status": "SUCCESS",
            "section_id": section_id,
            "allocated_start": f"{opt_start // 60:02d}:{opt_start % 60:02d}",
            "allocated_end": f"{opt_end // 60:02d}:{opt_end % 60:02d}",
            "duration_minutes": combined_duration,
            "departments_coordinated": departments_involved,
            "total_disruption_cost": solver.ObjectiveValue(),
            "impacted_trains": impacted_trains
        }
    
    return {"status": "FAILED", "message": "No feasible window found."}


# ==============================================================================
# TEST RUN
# ==============================================================================
if __name__ == "__main__":
    # Sample timetable passing through Section SEC_GZB_ALJN
    mock_trains = [
        {"train_id": 12002, "name": "Bhopal Shatabdi", "priority": 1, "scheduled_minute": 360},  # 06:00 AM
        {"train_id": 22436, "name": "Vande Bharat Exp", "priority": 1, "scheduled_minute": 450},  # 07:30 AM
        {"train_id": 12402, "name": "Magadh Express", "priority": 2, "scheduled_minute": 600},    # 10:00 AM
        {"train_id": 54321, "name": "Freight Container", "priority": 3, "scheduled_minute": 700}, # 11:40 AM
    ]

    # Two departments requesting blocks on the same section
    mock_requests = [
        {"dept": "Engineering (Track)", "duration_mins": 90},
        {"dept": "TRD (Electrical OHE)", "duration_mins": 60}
    ]

    output = optimize_maintenance_block("SEC_GZB_ALJN", mock_trains, mock_requests)
    print("\n--- SOLVER OUTPUT ---")
    print(json.dumps(output, indent=2))