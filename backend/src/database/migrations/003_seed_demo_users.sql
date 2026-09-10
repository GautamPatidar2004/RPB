-- ============================================================================
-- Migration: 003_seed_demo_users.sql
-- Description: Seed 3 core demo users (Admin, Planner, Operations)
-- Passwords safely hashed using Node.js scrypt with cryptographic salt
-- ============================================================================

DO $$
DECLARE
    role_admin_id UUID;
    role_planner_id UUID;
    role_operations_id UUID;
    dept_engg_id UUID;
    dept_optg_id UUID;
BEGIN
    SELECT id INTO role_admin_id FROM roles WHERE code = 'ADMIN';
    SELECT id INTO role_planner_id FROM roles WHERE code = 'PLANNER';
    SELECT id INTO role_operations_id FROM roles WHERE code = 'OPERATIONS';

    SELECT id INTO dept_engg_id FROM departments WHERE code = 'ENGG';
    SELECT id INTO dept_optg_id FROM departments WHERE code = 'OPTG';

    -- 1. Demo Admin User (Password: Admin@123)
    INSERT INTO users (
        role_id, department_id, employee_id, username, email,
        password_hash, full_name, designation, phone, is_active
    ) VALUES (
        role_admin_id, NULL, 'IR-ADM-001', 'admin', 'admin@railway.gov.in',
        '8f969a7f47bd0ffa9dc92dc1043f8baa:8367dd3f73baa47190311bb5c19d93c442bb3b31e7b04002ca5855b6779e059df07bb905edd69344993da5a9f5b1c1852306f564cb2c9fe75104b7eb4aea2d27',
        'System Administrator', 'Principal Chief Operations Manager (IT)', '+91-11-2338-0001', TRUE
    )
    ON CONFLICT (username) DO UPDATE SET
        password_hash = EXCLUDED.password_hash,
        role_id = EXCLUDED.role_id,
        is_active = TRUE;

    -- 2. Demo Planner User (Password: Planner@123)
    INSERT INTO users (
        role_id, department_id, employee_id, username, email,
        password_hash, full_name, designation, phone, is_active
    ) VALUES (
        role_planner_id, dept_engg_id, 'IR-PLN-102', 'planner', 'planner@railway.gov.in',
        'ef4613bd8b3d151aaffc6db1504882f1:2cfa7b6ecad87baa0060e7978fae9e1a3e9d4e9ea10f34a940d1cb5062502336fc1d091bf24b288cfcd6dbe13eb56959744cc2d322cd4964047bfe00dfdf453f',
        'Rajesh Sharma', 'Senior Section Engineer (Planning)', '+91-11-2338-1102', TRUE
    )
    ON CONFLICT (username) DO UPDATE SET
        password_hash = EXCLUDED.password_hash,
        role_id = EXCLUDED.role_id,
        department_id = EXCLUDED.department_id,
        is_active = TRUE;

    -- 3. Demo Operations User (Password: Operations@123)
    INSERT INTO users (
        role_id, department_id, employee_id, username, email,
        password_hash, full_name, designation, phone, is_active
    ) VALUES (
        role_operations_id, dept_optg_id, 'IR-OPS-204', 'operations', 'operations@railway.gov.in',
        'f1697dafba1a1b46ee5f15e0a9031524:4b7a0ad1837cf277be2f42a2f23cc95c434255c69776c6a848e2e91466dc2ee159454bb16b5e25169df6263de3bea40d064927df9b0dfe7db79479d75857a542',
        'Amit Verma', 'Chief Controller (Operating)', '+91-11-2338-2204', TRUE
    )
    ON CONFLICT (username) DO UPDATE SET
        password_hash = EXCLUDED.password_hash,
        role_id = EXCLUDED.role_id,
        department_id = EXCLUDED.department_id,
        is_active = TRUE;

END $$;
