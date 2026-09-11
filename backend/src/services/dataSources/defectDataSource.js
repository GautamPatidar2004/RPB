/**
 * DefectDataSource
 * 
 * Standardized interface for defect, failure, and diagnostic incident reports
 * driving departmental maintenance demands.
 */

class DefectDataSource {
    /**
     * Fetch defects matching specified options
     * @param {Object} options - { corridorCode, department, severity, status, limit }
     * @returns {Promise<Array<Object>>} Standardized Defects
     */
    async fetchDefects(options = {}) {
        throw new Error('DefectDataSource.fetchDefects must be implemented by concrete provider');
    }

    /**
     * Fetch a specific defect by its ID
     * @param {string} defectId - Defect identifier
     * @returns {Promise<Object|null>}
     */
    async getDefectById(defectId) {
        throw new Error('DefectDataSource.getDefectById must be implemented by concrete provider');
    }
}

module.exports = DefectDataSource;
