/**
 * MaintenanceDataSource
 * 
 * Standardized interface for external maintenance demand sources:
 * - BDMS (Breakdown / Engineering Maintenance Requests)
 * - TDMS (Traction Distribution / OHE Maintenance Requests)
 * - SMMS (Signal & Telecommunication Maintenance Requests)
 * - Future CRIS API Connectors
 */

class MaintenanceDataSource {
    /**
     * Fetch maintenance requests matching specified options
     * @param {Object} options - { corridorCode, department, horizonStart, horizonEnd, sourceSystem, limit }
     * @returns {Promise<Array<Object>>} Standardized Maintenance Requests
     */
    async fetchMaintenanceRequests(options = {}) {
        throw new Error('MaintenanceDataSource.fetchMaintenanceRequests must be implemented by concrete provider');
    }

    /**
     * Fetch a specific maintenance request by its ID
     * @param {string} requestId - Maintenance request ID
     * @returns {Promise<Object|null>}
     */
    async getMaintenanceRequestById(requestId) {
        throw new Error('MaintenanceDataSource.getMaintenanceRequestById must be implemented by concrete provider');
    }
}

module.exports = MaintenanceDataSource;
