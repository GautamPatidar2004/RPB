/**
 * AssetDataSource
 * 
 * Standardized interface for infrastructure and asset registries:
 * - Track sections, points, crossings (TMS/BDMS)
 * - Traction cantilever spans, substations, feeding posts (TDMS)
 * - Signal cabins, electronic interlocking, track circuits, point machines (SMMS)
 */

class AssetDataSource {
    /**
     * Fetch assets matching specified options
     * @param {Object} options - { corridorCode, assetType, criticality, healthStatus, limit }
     * @returns {Promise<Array<Object>>} Standardized Assets
     */
    async fetchAssets(options = {}) {
        throw new Error('AssetDataSource.fetchAssets must be implemented by concrete provider');
    }

    /**
     * Fetch a specific asset by its ID or code
     * @param {string} assetId - Asset identifier
     * @returns {Promise<Object|null>}
     */
    async getAssetById(assetId) {
        throw new Error('AssetDataSource.getAssetById must be implemented by concrete provider');
    }
}

module.exports = AssetDataSource;
