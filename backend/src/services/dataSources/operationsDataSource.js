/**
 * OperationsDataSource
 * 
 * Standardized interface for operational and train movement sources:
 * - Real-time train schedules, movements, and path availability (COA)
 * - Available traffic, power, and integrated block windows (COA/BDMS)
 */

class OperationsDataSource {
    /**
     * Fetch train movements matching specified options
     * @param {Object} options - { corridorCode, startTime, endTime, direction, trainType, limit }
     * @returns {Promise<Array<Object>>} Standardized Train Movements
     */
    async fetchTrainMovements(options = {}) {
        throw new Error('OperationsDataSource.fetchTrainMovements must be implemented by concrete provider');
    }

    /**
     * Fetch block windows matching specified options
     * @param {Object} options - { corridorCode, startTime, endTime, blockType, availabilityStatus, limit }
     * @returns {Promise<Array<Object>>} Standardized Block Windows
     */
    async fetchBlockWindows(options = {}) {
        throw new Error('OperationsDataSource.fetchBlockWindows must be implemented by concrete provider');
    }
}

module.exports = OperationsDataSource;
