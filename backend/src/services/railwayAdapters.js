/**
 * Indian Railways External System Adapters (MVP Simulated Gateways)
 * 
 * In production, these adapters interface with Centre for Railway Information Systems (CRIS)
 * enterprise endpoints over HTTPS/mTLS.
 * 
 * Supported Systems:
 * 1. TMS  - Track Management System (Permanent Way maintenance demands)
 * 2. SMMS - Signal Maintenance Management System (S&T interlocking, points & signals)
 * 3. TDMS - Traction Distribution Management System (25kV OHE power demands)
 * 4. COA  - Control Office Application (Real-time train movements & traffic windows)
 * 5. BDMS - Breakdown Management System (Rolling stock & relief train block windows)
 */

class RailwayAdapters {
    /**
     * Fetch Track Maintenance Tasks & Track Assets from TMS
     */
    async fetchTMS(options = {}) {
        return {
            source: 'TMS',
            timestamp: new Date().toISOString(),
            records: [
                {
                    externalId: 'TMS-TASK-9921',
                    corridorCode: 'NDLS-CNB',
                    taskCode: 'TAMP-UP-112',
                    title: 'Mechanized Heavy Track Tamping & Deep Screening',
                    description: 'Tamping of UP Main Line track to restore track geometry following monsoonal settling.',
                    maintenanceType: 'TRACK_TAMPING',
                    durationMinutes: 180,
                    priority: 1,
                    criticality: 'CRITICAL',
                    urgency: 'HIGH',
                    requiredByDate: '2026-09-15T18:00:00.000Z',
                    powerBlockRequired: false,
                    trafficBlockRequired: true,
                    speedRestrictionKmph: 30,
                    asset: {
                        externalId: 'TMS-ASSET-8812',
                        assetCode: 'TRK-UP-112',
                        name: 'UP Main Track Section KM 112-116',
                        assetType: 'TRACK',
                        location: 'KM 112.000 to 116.000 (Khurja Section)',
                        startKm: 112.000,
                        endKm: 116.000,
                        criticality: 'CRITICAL',
                        healthStatus: 'MAINTENANCE_REQUIRED'
                    },
                    operationalConstraints: { machineRequired: 'CSU-09-3X Tamping Express', ballastDepot: 'ALJN' }
                },
                {
                    externalId: 'TMS-TASK-1044',
                    corridorCode: 'NDLS-CNB',
                    taskCode: 'RAIL-REL-44',
                    title: 'Through Rail Renewal (TRR) 60kg 90UTS',
                    description: 'Replacement of fatigued rails due to GMT limit exceedance.',
                    maintenanceType: 'RAIL_REPLACEMENT',
                    durationMinutes: 240,
                    priority: 2,
                    criticality: 'HIGH',
                    urgency: 'HIGH',
                    requiredByDate: '2026-09-17T12:00:00.000Z',
                    powerBlockRequired: false,
                    trafficBlockRequired: true,
                    speedRestrictionKmph: 20,
                    asset: {
                        externalId: 'TMS-ASSET-8812',
                        assetCode: 'TRK-UP-112',
                        name: 'UP Main Track Section KM 112-116',
                        assetType: 'TRACK',
                        location: 'KM 112.000 to 116.000 (Khurja Section)',
                        startKm: 112.000,
                        endKm: 116.000,
                        criticality: 'HIGH',
                        healthStatus: 'MAINTENANCE_REQUIRED'
                    },
                    operationalConstraints: { flashButtWelder: true }
                }
            ]
        };
    }

    /**
     * Fetch Signal & Interlocking Maintenance Tasks from SMMS
     */
    async fetchSMMS(options = {}) {
        return {
            source: 'SMMS',
            timestamp: new Date().toISOString(),
            records: [
                {
                    externalId: 'SMMS-TASK-4402',
                    corridorCode: 'NDLS-CNB',
                    taskCode: 'SIG-PNT-44',
                    title: 'Point Machine Obstruction Testing & Contact Cleaning',
                    description: 'Routine quarterly overhaul and correspondence check of Turnout 102A/B.',
                    maintenanceType: 'POINTS_TESTING',
                    durationMinutes: 90,
                    priority: 2,
                    criticality: 'HIGH',
                    urgency: 'MEDIUM',
                    requiredByDate: '2026-09-18T12:00:00.000Z',
                    powerBlockRequired: false,
                    trafficBlockRequired: true,
                    asset: {
                        externalId: 'SMMS-ASSET-3301',
                        assetCode: 'SIG-EI-CNB',
                        name: 'Electronic Interlocking Central Cabin CNB',
                        assetType: 'INTERLOCKING',
                        location: 'Kanpur Central Yard',
                        startKm: 439.500,
                        endKm: 440.500,
                        criticality: 'HIGH',
                        healthStatus: 'OPERATIONAL'
                    },
                    operationalConstraints: { shadowAllowed: true, disconnectedGear: 'Turnout 102A/B' }
                }
            ]
        };
    }

    /**
     * Fetch Traction & OHE Maintenance Tasks from TDMS
     */
    async fetchTDMS(options = {}) {
        return {
            source: 'TDMS',
            timestamp: new Date().toISOString(),
            records: [
                {
                    externalId: 'TDMS-TASK-7719',
                    corridorCode: 'NDLS-CNB',
                    taskCode: 'OHE-INSP-204',
                    title: 'OHE Contact Wire Height & Stagger Inspection',
                    description: 'Tower wagon inspection of contact wire wear and dropper adjustments.',
                    maintenanceType: 'OHE_INSPECTION',
                    durationMinutes: 120,
                    priority: 2,
                    criticality: 'MEDIUM',
                    urgency: 'MEDIUM',
                    requiredByDate: '2026-09-20T08:00:00.000Z',
                    powerBlockRequired: true,
                    trafficBlockRequired: true,
                    asset: {
                        externalId: 'TDMS-ASSET-5521',
                        assetCode: 'OHE-TDL-140',
                        name: '25kV AC Traction Cantilever Span Tundla Junction',
                        assetType: 'OHE_LINE',
                        location: 'KM 204.000 to 208.000',
                        startKm: 204.000,
                        endKm: 208.000,
                        criticality: 'HIGH',
                        healthStatus: 'OPERATIONAL'
                    },
                    operationalConstraints: { powerShutoffSubstation: 'TDL-TSS', earthingRequired: true }
                }
            ]
        };
    }

    /**
     * Fetch Traffic Block Windows and Train Movements from COA
     */
    async fetchCOA(options = {}) {
        return {
            source: 'COA',
            timestamp: new Date().toISOString(),
            windows: [
                {
                    externalId: 'COA-WIN-1092',
                    corridorCode: 'NDLS-CNB',
                    startTime: '2026-09-12T01:00:00.000Z',
                    endTime: '2026-09-12T04:30:00.000Z',
                    durationMinutes: 210,
                    availabilityStatus: 'AVAILABLE',
                    blockType: 'TRAFFIC_BLOCK',
                    lineDesignation: 'UP_MAIN',
                    startKm: 110.000,
                    endKm: 125.000,
                    operationalConstraints: { cautionaryOrder: 'Normal Caution 30kmph on resumption' }
                }
            ],
            trains: [
                {
                    externalId: 'COA-TRN-12004-20260912',
                    corridorCode: 'NDLS-CNB',
                    trainNumber: '12004',
                    serviceIdentifier: '12004_NDLS_LKO_20260912',
                    scheduledStartTime: '2026-09-12T06:10:00.000Z',
                    scheduledEndTime: '2026-09-12T11:40:00.000Z',
                    direction: 'DOWN',
                    trainType: 'SHATABDI',
                    priority: 1,
                    status: 'SCHEDULED',
                    operationalDetails: { rakeType: 'LHB', maxSpeedKmph: 130 }
                },
                {
                    externalId: 'COA-TRN-22436-20260912',
                    corridorCode: 'NDLS-CNB',
                    trainNumber: '22436',
                    serviceIdentifier: '22436_NDLS_BSB_20260912',
                    scheduledStartTime: '2026-09-12T06:00:00.000Z',
                    scheduledEndTime: '2026-09-12T14:00:00.000Z',
                    direction: 'DOWN',
                    trainType: 'VANDE_BHARAT',
                    priority: 1,
                    status: 'SCHEDULED',
                    operationalDetails: { rakeType: 'Train18', maxSpeedKmph: 160 }
                }
            ]
        };
    }

    /**
     * Fetch Integrated Maintenance & Breakdown Windows from BDMS
     */
    async fetchBDMS(options = {}) {
        return {
            source: 'BDMS',
            timestamp: new Date().toISOString(),
            windows: [
                {
                    externalId: 'BDMS-WIN-4491',
                    corridorCode: 'NDLS-CNB',
                    startTime: '2026-09-13T02:00:00.000Z',
                    endTime: '2026-09-13T05:00:00.000Z',
                    durationMinutes: 180,
                    availabilityStatus: 'RESERVED',
                    blockType: 'INTEGRATED_BLOCK',
                    lineDesignation: 'DN_MAIN',
                    startKm: 200.000,
                    endKm: 215.000,
                    operationalConstraints: { simultaneousOHE: true, breakdownCraneTransit: false }
                }
            ]
        };
    }
}

module.exports = new RailwayAdapters();
