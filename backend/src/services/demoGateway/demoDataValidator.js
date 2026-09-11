/**
 * Demo Data Validator
 * 
 * Validates generated demo records before database persistence.
 * Enforces schema compliance, logical constraints, and domain consistency.
 */

class DemoDataValidator {
    /**
     * Validate an array of maintenance requests
     * @param {Array<Object>} requests
     * @throws {Error} If any record fails validation
     */
    static validateMaintenanceRequests(requests) {
        if (!Array.isArray(requests) || requests.length === 0) {
            throw new Error('Maintenance requests must be a non-empty array');
        }

        const validCriticalities = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];
        const validUrgencies = ['IMMEDIATE', 'HIGH', 'MEDIUM', 'LOW'];
        const validDepartments = ['ENGG', 'SNT', 'TRD'];

        requests.forEach((req, idx) => {
            const prefix = `Maintenance Request #${idx + 1} (${req.externalId || 'unknown'})`;

            if (!req.externalId || typeof req.externalId !== 'string') {
                throw new Error(`${prefix}: externalId is required and must be a string`);
            }
            if (!req.corridorCode) {
                throw new Error(`${prefix}: corridorCode is required`);
            }
            if (!validDepartments.includes(req.departmentCode)) {
                throw new Error(`${prefix}: invalid departmentCode '${req.departmentCode}'. Must be one of: ${validDepartments.join(', ')}`);
            }
            if (!req.title || req.title.trim().length === 0) {
                throw new Error(`${prefix}: title is required`);
            }
            if (!req.maintenanceType) {
                throw new Error(`${prefix}: maintenanceType is required`);
            }
            if (!Number.isInteger(req.durationMinutes) || req.durationMinutes <= 0) {
                throw new Error(`${prefix}: durationMinutes must be a positive integer`);
            }
            if (!Number.isInteger(req.priority) || req.priority < 1 || req.priority > 5) {
                throw new Error(`${prefix}: priority must be an integer between 1 and 5`);
            }
            if (!validCriticalities.includes(req.criticality)) {
                throw new Error(`${prefix}: invalid criticality '${req.criticality}'`);
            }
            if (!validUrgencies.includes(req.urgency)) {
                throw new Error(`${prefix}: invalid urgency '${req.urgency}'`);
            }

            const reqDate = new Date(req.requiredByDate);
            if (isNaN(reqDate.getTime())) {
                throw new Error(`${prefix}: invalid requiredByDate`);
            }

            if (req.dataSourceType !== 'DEMO') {
                throw new Error(`${prefix}: dataSourceType must explicitly be 'DEMO'`);
            }

            // Semantic integrity: Critical tasks must not have lowest priority (priority 5)
            if (req.criticality === 'CRITICAL' && req.priority > 2) {
                throw new Error(`${prefix}: semantic inconsistency - CRITICAL criticality must have priority 1 or 2`);
            }

            // Must reference an asset
            if (!req.asset || !req.asset.assetCode || !req.asset.name) {
                throw new Error(`${prefix}: must include valid asset object with assetCode and name`);
            }
        });

        return true;
    }

    /**
     * Validate an array of infrastructure assets
     * @param {Array<Object>} assets
     */
    static validateAssets(assets) {
        if (!Array.isArray(assets)) {
            throw new Error('Assets must be an array');
        }

        const validCriticalities = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];
        const validHealthStatuses = ['OPERATIONAL', 'DEGRADED', 'MAINTENANCE_REQUIRED', 'UNDER_MAINTENANCE', 'FAILED', 'DECOMMISSIONED'];

        assets.forEach((a, idx) => {
            const prefix = `Asset #${idx + 1} (${a.assetCode || 'unknown'})`;
            if (!a.assetCode || !a.name || !a.assetType || !a.location) {
                throw new Error(`${prefix}: assetCode, name, assetType, and location are required`);
            }
            if (!validCriticalities.includes(a.criticality)) {
                throw new Error(`${prefix}: invalid criticality '${a.criticality}'`);
            }
            if (!validHealthStatuses.includes(a.healthStatus)) {
                throw new Error(`${prefix}: invalid healthStatus '${a.healthStatus}'`);
            }
            if (a.dataSourceType !== 'DEMO') {
                throw new Error(`${prefix}: dataSourceType must explicitly be 'DEMO'`);
            }
        });

        return true;
    }

    /**
     * Validate an array of defects
     * @param {Array<Object>} defects
     */
    static validateDefects(defects) {
        if (!Array.isArray(defects)) {
            throw new Error('Defects must be an array');
        }

        const validSeverities = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];
        const validStatuses = ['REPORTED', 'VERIFIED', 'WORK_ORDERED', 'RESOLVED'];

        defects.forEach((d, idx) => {
            const prefix = `Defect #${idx + 1} (${d.defectCode || 'unknown'})`;
            if (!d.defectCode || !d.defectType || !d.description) {
                throw new Error(`${prefix}: defectCode, defectType, and description are required`);
            }
            if (!validSeverities.includes(d.severity)) {
                throw new Error(`${prefix}: invalid severity '${d.severity}'`);
            }
            if (!validStatuses.includes(d.status)) {
                throw new Error(`${prefix}: invalid status '${d.status}'`);
            }
            if (d.dataSourceType !== 'DEMO') {
                throw new Error(`${prefix}: dataSourceType must explicitly be 'DEMO'`);
            }
        });

        return true;
    }

    /**
     * Validate an array of train movements
     * @param {Array<Object>} trains
     */
    static validateTrainMovements(trains) {
        if (!Array.isArray(trains)) {
            throw new Error('Train movements must be an array');
        }

        const validDirections = ['UP', 'DOWN', 'BIDIRECTIONAL'];
        const validTypes = ['VANDE_BHARAT', 'RAJDHANI', 'SHATABDI', 'SUPERFAST', 'MAIL_EXPRESS', 'PASSENGER', 'FREIGHT', 'PARCEL', 'SPECIAL'];

        trains.forEach((t, idx) => {
            const prefix = `Train #${idx + 1} (${t.trainNumber || 'unknown'})`;
            if (!t.trainNumber || !t.serviceIdentifier) {
                throw new Error(`${prefix}: trainNumber and serviceIdentifier are required`);
            }
            if (!validDirections.includes(t.direction)) {
                throw new Error(`${prefix}: invalid direction '${t.direction}'`);
            }
            if (!validTypes.includes(t.trainType)) {
                throw new Error(`${prefix}: invalid trainType '${t.trainType}'`);
            }

            const start = new Date(t.scheduledStartTime);
            const end = new Date(t.scheduledEndTime);
            if (isNaN(start.getTime()) || isNaN(end.getTime()) || end <= start) {
                throw new Error(`${prefix}: scheduledEndTime must be strictly after scheduledStartTime`);
            }
            if (t.dataSourceType !== 'DEMO') {
                throw new Error(`${prefix}: dataSourceType must explicitly be 'DEMO'`);
            }
        });

        return true;
    }

    /**
     * Validate an array of block windows
     * @param {Array<Object>} windows
     */
    static validateBlockWindows(windows) {
        if (!Array.isArray(windows)) {
            throw new Error('Block windows must be an array');
        }

        const validTypes = ['TRAFFIC_BLOCK', 'POWER_BLOCK', 'INTEGRATED_BLOCK', 'SHADOW_BLOCK', 'EMERGENCY_BLOCK'];
        const validStatuses = ['AVAILABLE', 'RESERVED', 'CONFIRMED', 'UTILIZED', 'CANCELLED', 'RESCHEDULED'];

        windows.forEach((w, idx) => {
            const prefix = `Block Window #${idx + 1} (${w.externalId || 'unknown'})`;
            if (!w.externalId) {
                throw new Error(`${prefix}: externalId is required`);
            }
            if (!validTypes.includes(w.blockType)) {
                throw new Error(`${prefix}: invalid blockType '${w.blockType}'`);
            }
            if (!validStatuses.includes(w.availabilityStatus)) {
                throw new Error(`${prefix}: invalid availabilityStatus '${w.availabilityStatus}'`);
            }

            const start = new Date(w.startTime);
            const end = new Date(w.endTime);
            if (isNaN(start.getTime()) || isNaN(end.getTime()) || end <= start) {
                throw new Error(`${prefix}: endTime must be strictly after startTime`);
            }
            if (!Number.isInteger(w.durationMinutes) || w.durationMinutes <= 0) {
                throw new Error(`${prefix}: durationMinutes must be a positive integer`);
            }
            if (w.dataSourceType !== 'DEMO') {
                throw new Error(`${prefix}: dataSourceType must explicitly be 'DEMO'`);
            }
        });

        return true;
    }
}

module.exports = DemoDataValidator;
