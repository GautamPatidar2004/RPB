/**
 * DemoDataSource (Indian Railways External Systems Simulator)
 * 
 * Implements standardized data source interfaces:
 * - MaintenanceDataSource (BDMS, TDMS, SMMS)
 * - AssetDataSource
 * - DefectDataSource
 * - OperationsDataSource (COA)
 * 
 * All simulated records are marked with:
 * - source_system: 'BDMS' | 'TDMS' | 'SMMS' | 'COA'
 * - data_source_type: 'DEMO'
 */

const MaintenanceDataSource = require('../dataSources/maintenanceDataSource');
const AssetDataSource = require('../dataSources/assetDataSource');
const DefectDataSource = require('../dataSources/defectDataSource');
const OperationsDataSource = require('../dataSources/operationsDataSource');
const DemoDataValidator = require('./demoDataValidator');

class DemoDataSource extends MaintenanceDataSource {
    constructor() {
        super();
        // Implements other contracts
        this.assetSource = new (class extends AssetDataSource {})();
        this.defectSource = new (class extends DefectDataSource {})();
        this.operationsSource = new (class extends OperationsDataSource {})();
    }

    /**
     * Generate interconnected simulation dataset for a given corridor and horizon
     * @param {Object} options Configuration options
     * @returns {Object} Complete interconnected dataset { maintenanceRequests, assets, defects, trainMovements, blockWindows, dependencies }
     */
    generateDataset(options = {}) {
        const {
            corridorCode = 'NDLS-CNB',
            requestCount = 6,
            departmentDistribution = { ENGG: 2, SNT: 2, TRD: 2 },
            horizonStart = new Date().toISOString(),
            horizonEnd = new Date(Date.now() + 86400000 * 7).toISOString(),
            seed = 42
        } = options;

        const hStart = new Date(horizonStart);
        const hEnd = new Date(horizonEnd);
        const horizonSpanMs = Math.max(hEnd.getTime() - hStart.getTime(), 86400000);

        // Deterministic pseudo-random helper using seed
        let currentSeed = Number(seed) || 42;
        const pseudoRand = () => {
            currentSeed = (currentSeed * 9301 + 49297) % 233280;
            return currentSeed / 233280;
        };

        const targetEngg = departmentDistribution.ENGG ?? Math.max(1, Math.round(requestCount / 3));
        const targetSnt = departmentDistribution.SNT ?? Math.max(1, Math.round(requestCount / 3));
        const targetTrd = departmentDistribution.TRD ?? Math.max(1, requestCount - targetEngg - targetSnt);

        // -------------------------------------------------------------
        // 1. Realistic Asset Blueprints
        // -------------------------------------------------------------
        const assetBlueprints = {
            ENGG: [
                {
                    code: 'TRK-UP-114',
                    name: 'UP Main Track Section KM 112-116',
                    type: 'TRACK',
                    location: 'KM 112.000 to 116.000 (Khurja Section)',
                    startKm: 112.000,
                    endKm: 116.000,
                    criticality: 'CRITICAL',
                    health: 'MAINTENANCE_REQUIRED',
                    sourceSystem: 'BDMS'
                },
                {
                    code: 'TRK-DN-205',
                    name: 'DN Main Track Section KM 204-208',
                    type: 'TRACK',
                    location: 'KM 204.000 to 208.000 (Tundla Section)',
                    startKm: 204.000,
                    endKm: 208.000,
                    criticality: 'HIGH',
                    health: 'DEGRADED',
                    sourceSystem: 'BDMS'
                },
                {
                    code: 'PNT-ALJN-14',
                    name: 'Turnout 14A/B 1:12 Curved Switch',
                    type: 'TURNOUT',
                    location: 'Aligarh Junction Yard KM 126.200',
                    startKm: 126.000,
                    endKm: 126.500,
                    criticality: 'MEDIUM',
                    health: 'OPERATIONAL',
                    sourceSystem: 'BDMS'
                },
                {
                    code: 'TRK-UP-310',
                    name: 'UP Main Ballast Cushion KM 308-312',
                    type: 'TRACK',
                    location: 'KM 308.000 to 312.000 (Etawah Section)',
                    startKm: 308.000,
                    endKm: 312.000,
                    criticality: 'MEDIUM',
                    health: 'DEGRADED',
                    sourceSystem: 'BDMS'
                }
            ],
            SNT: [
                {
                    code: 'SIG-PNT-CNB-102',
                    name: 'Point Machine 102A/B IRS Electric',
                    type: 'POINT_MACHINE',
                    location: 'Kanpur Central West Cabin KM 439.800',
                    startKm: 439.500,
                    endKm: 440.000,
                    criticality: 'HIGH',
                    health: 'MAINTENANCE_REQUIRED',
                    sourceSystem: 'SMMS'
                },
                {
                    code: 'SIG-TC-GZB-3',
                    name: 'Audio Frequency Track Circuit TC-3 Up Line',
                    type: 'TRACK_CIRCUIT',
                    location: 'Ghaziabad Outer KM 25.400',
                    startKm: 25.000,
                    endKm: 26.000,
                    criticality: 'CRITICAL',
                    health: 'DEGRADED',
                    sourceSystem: 'SMMS'
                },
                {
                    code: 'SIG-EI-TDL',
                    name: 'Electronic Interlocking Central Cabin TDL',
                    type: 'INTERLOCKING',
                    location: 'Tundla Junction Cabin KM 203.800',
                    startKm: 203.500,
                    endKm: 204.000,
                    criticality: 'HIGH',
                    health: 'OPERATIONAL',
                    sourceSystem: 'SMMS'
                }
            ],
            TRD: [
                {
                    code: 'OHE-TDL-206',
                    name: '25kV AC Traction Cantilever Span TDL',
                    type: 'OHE_LINE',
                    location: 'KM 204.000 to 208.000 (Tundla Section)',
                    startKm: 204.000,
                    endKm: 208.000,
                    criticality: 'HIGH',
                    health: 'MAINTENANCE_REQUIRED',
                    sourceSystem: 'TDMS'
                },
                {
                    code: 'TSS-ALJN-1',
                    name: '25kV Traction Substation Power Transformer 1',
                    type: 'SUBSTATION',
                    location: 'Aligarh Traction Substation KM 125.000',
                    startKm: 124.800,
                    endKm: 125.200,
                    criticality: 'CRITICAL',
                    health: 'MAINTENANCE_REQUIRED',
                    sourceSystem: 'TDMS'
                },
                {
                    code: 'OHE-ETW-295',
                    name: '25kV AC OHE Tension Length Section ETW',
                    type: 'OHE_LINE',
                    location: 'KM 294.500 to 297.000 (Etawah Section)',
                    startKm: 294.500,
                    endKm: 297.000,
                    criticality: 'LOW',
                    health: 'OPERATIONAL',
                    sourceSystem: 'TDMS'
                }
            ]
        };

        // -------------------------------------------------------------
        // 2. Realistic Defect & Failure Catalog
        // -------------------------------------------------------------
        const defectCatalog = {
            ENGG: [
                {
                    defectCode: 'DEF-ENG-USFD-101',
                    defectType: 'RAIL_FRACTURE_RISK',
                    severity: 'CRITICAL',
                    description: 'Ultrasonic Flaw Detection (USFD) flagged 35mm transverse flaw in 60kg rail head on UP Main.',
                    component: 'Rail Head 60kg 90UTS',
                    failureRisk: 'High risk of rail fracture under high-speed Vande Bharat pass'
                },
                {
                    defectCode: 'DEF-ENG-TWIST-102',
                    defectType: 'TRACK_GEOMETRY_DEVIATION',
                    severity: 'HIGH',
                    description: 'Track geometry car TRC recorded vertical twist exceedance (3.2mm/m) post-monsoon.',
                    component: 'Ballast & Sleepers',
                    failureRisk: 'Lurching and speed restriction imposition'
                },
                {
                    defectCode: 'DEF-ENG-PNT-103',
                    defectType: 'TURNOUT_WEAR',
                    severity: 'MEDIUM',
                    description: 'Worn nose of crossings with 4mm top wear exceeding safety parameter.',
                    component: 'Switch Tongue Rail',
                    failureRisk: 'Wheel flanging risk on trailing turnout'
                },
                {
                    defectCode: 'DEF-ENG-BAL-104',
                    defectType: 'BALLAST_FOULING',
                    severity: 'MEDIUM',
                    description: 'Deep ballast screening overdue; 42% fouling index measured.',
                    component: 'Track Bed Ballast',
                    failureRisk: 'Poor drainage and sleeper pumping under heavy axle load'
                }
            ],
            SNT: [
                {
                    defectCode: 'DEF-SNT-PNT-201',
                    defectType: 'POINT_MACHINE_OBSTRUCTION',
                    severity: 'HIGH',
                    description: 'Point machine 102A/B operating time increased from 4s to 8.5s with microswitch contact resistance.',
                    component: 'Electric Point Motor 110V DC',
                    failureRisk: 'Point detection failure causing signal blanking and section halt'
                },
                {
                    defectCode: 'DEF-SNT-TC-202',
                    defectType: 'FALSE_TRACK_OCCUPANCY',
                    severity: 'CRITICAL',
                    description: 'Intermittent track circuit dropouts on UP line during high humidity.',
                    component: 'AFTC Tuning Unit & Impedance Bond',
                    failureRisk: 'Unsafe signal revert to danger in front of oncoming train'
                },
                {
                    defectCode: 'DEF-SNT-EI-203',
                    defectType: 'INTERLOCKING_DIAGNOSTIC_WARNING',
                    severity: 'MEDIUM',
                    description: 'Warm standby VDU CPU checksum warning in Electronic Interlocking redundant channel.',
                    component: 'Vital Computer Card 24V',
                    failureRisk: 'System failsafe switchover degradation'
                }
            ],
            TRD: [
                {
                    defectCode: 'DEF-TRD-OHE-301',
                    defectType: 'CONTACT_WIRE_WEAR',
                    severity: 'HIGH',
                    description: 'Contact wire diameter reduced to 10.8mm (permissible min 10.5mm); 4 slack droppers recorded.',
                    component: 'Hard Drawn Grooved Copper Wire 107 sq.mm',
                    failureRisk: 'Pantograph entangling and catenary tear down'
                },
                {
                    defectCode: 'DEF-TRD-TSS-302',
                    defectType: 'TRANSFORMER_THERMAL_ALERT',
                    severity: 'CRITICAL',
                    description: 'DGA analysis of traction transformer shows dissolved acetylene trace indicating localized hotspot.',
                    component: '21.6 MVA 132/25kV Traction Power Transformer',
                    failureRisk: 'Catastrophic substation blackout across 60km section'
                },
                {
                    defectCode: 'DEF-TRD-INS-303',
                    defectType: 'INSULATOR_POLLUTION_FLASH',
                    severity: 'LOW',
                    description: 'Heavy industrial particulate accumulation on cantilever porcelain insulators.',
                    component: '25kV Bracket Insulator',
                    failureRisk: 'Flashover during heavy morning fog'
                }
            ]
        };

        // -------------------------------------------------------------
        // 3. Assemble Interconnected Maintenance Tasks, Assets, & Defects
        // -------------------------------------------------------------
        const generatedRequests = [];
        const generatedAssets = [];
        const generatedDefects = [];

        const addDepartmentRequests = (deptCode, count, sourceSystem) => {
            const blueprints = assetBlueprints[deptCode];
            const defects = defectCatalog[deptCode];

            for (let i = 0; i < count; i++) {
                const bIdx = i % blueprints.length;
                const dIdx = i % defects.length;
                const blueprint = blueprints[bIdx];
                const defect = defects[dIdx];

                const reqNum = generatedRequests.length + 1;
                const taskId = `${sourceSystem}-TASK-${corridorCode.replace('-', '')}-${String(reqNum).padStart(3, '0')}`;
                const assetId = `${sourceSystem}-ASSET-${blueprint.code}`;
                const defectId = `${sourceSystem}-${defect.defectCode}`;

                // Calculate realistic scheduled required-by date within horizon
                const randomOffsetMs = Math.floor(pseudoRand() * (horizonSpanMs * 0.8)) + (86400000 * 0.5);
                const reqDate = new Date(hStart.getTime() + randomOffsetMs);

                // Priority correlated with defect severity
                let priority = 3;
                let urgency = 'MEDIUM';
                let durationMinutes = 120;
                let powerBlock = false;
                let trafficBlock = true;
                let speedRestriction = null;

                if (defect.severity === 'CRITICAL') {
                    priority = 1;
                    urgency = 'IMMEDIATE';
                    durationMinutes = deptCode === 'ENGG' ? 240 : (deptCode === 'TRD' ? 210 : 90);
                    speedRestriction = deptCode === 'ENGG' ? 20 : null;
                } else if (defect.severity === 'HIGH') {
                    priority = 2;
                    urgency = 'HIGH';
                    durationMinutes = deptCode === 'ENGG' ? 180 : (deptCode === 'TRD' ? 150 : 90);
                    speedRestriction = deptCode === 'ENGG' ? 30 : null;
                } else {
                    priority = 3;
                    urgency = 'MEDIUM';
                    durationMinutes = 90;
                }

                if (deptCode === 'TRD') {
                    powerBlock = true;
                }

                const assetRecord = {
                    externalId: assetId,
                    assetCode: blueprint.code,
                    name: blueprint.name,
                    assetType: blueprint.type,
                    location: blueprint.location,
                    startKm: blueprint.startKm,
                    endKm: blueprint.endKm,
                    criticality: blueprint.criticality,
                    healthStatus: blueprint.health,
                    sourceSystem: sourceSystem,
                    dataSourceType: 'DEMO',
                    metadata: {
                        corridorCode,
                        dataSourceType: 'DEMO',
                        data_source_type: 'DEMO',
                        sourceSystem: sourceSystem,
                        inspectedBy: `${deptCode}-INSPECTOR-DEMO`,
                        lastInspectionDate: new Date(Date.now() - 86400000 * 14).toISOString()
                    }
                };

                const defectRecord = {
                    externalId: defectId,
                    defectCode: defect.defectCode,
                    defectType: defect.defectType,
                    severity: defect.severity,
                    description: defect.description,
                    component: defect.component,
                    failureRisk: defect.failureRisk,
                    status: 'REPORTED',
                    departmentCode: deptCode,
                    assetCode: blueprint.code,
                    corridorCode,
                    sourceSystem,
                    dataSourceType: 'DEMO',
                    reportedAt: new Date(Date.now() - 86400000 * 2).toISOString()
                };

                const taskTitle = deptCode === 'ENGG'
                    ? (defect.severity === 'CRITICAL' ? `Emergency Through Rail Renewal (TRR 60kg) ${blueprint.code}` : `Mechanized Track Tamping & Packing ${blueprint.code}`)
                    : (deptCode === 'SNT'
                        ? `Signal & Interlocking Overhaul ${blueprint.name}`
                        : `OHE Power Distribution & Contact Wire Restoration ${blueprint.name}`);

                const requestRecord = {
                    externalId: taskId,
                    corridorCode,
                    taskCode: `${sourceSystem}-${blueprint.code}`,
                    title: taskTitle,
                    description: `${defect.description} Remedial action required to prevent train operation disruptions.`,
                    maintenanceType: deptCode === 'ENGG' ? (defect.severity === 'CRITICAL' ? 'RAIL_REPLACEMENT' : 'TRACK_TAMPING') : (deptCode === 'SNT' ? 'SIGNAL_INTERLOCKING' : 'OHE_MAINTENANCE'),
                    durationMinutes,
                    priority,
                    criticality: defect.severity,
                    urgency,
                    requiredByDate: reqDate.toISOString(),
                    status: 'PENDING',
                    powerBlockRequired: powerBlock,
                    trafficBlockRequired: trafficBlock,
                    speedRestrictionKmph: speedRestriction,
                    departmentCode: deptCode,
                    sourceSystem: sourceSystem,
                    dataSourceType: 'DEMO',
                    asset: assetRecord,
                    defect: defectRecord,
                    operationalConstraints: {
                        dataSourceType: 'DEMO',
                        sourceSystem: sourceSystem,
                        defectCode: defect.defectCode,
                        severity: defect.severity,
                        riskMitigation: defect.failureRisk,
                        requiredMachinery: deptCode === 'ENGG' ? 'Tamping Express CSU-09-3X / Weld Gang' : (deptCode === 'TRD' ? 'OHE Tower Wagon TW-201' : 'S&T Tool Van'),
                        earthingRequired: powerBlock,
                        shadowAllowed: deptCode === 'SNT'
                    }
                };

                generatedRequests.push(requestRecord);
                if (!generatedAssets.some(a => a.assetCode === assetRecord.assetCode)) {
                    generatedAssets.push(assetRecord);
                }
                generatedDefects.push(defectRecord);
            }
        };

        // Generate per department
        addDepartmentRequests('ENGG', targetEngg, 'BDMS');
        addDepartmentRequests('SNT', targetSnt, 'SMMS');
        addDepartmentRequests('TRD', targetTrd, 'TDMS');

        // -------------------------------------------------------------
        // 4. Dependencies (e.g. Co-occurring Track & OHE maintenance)
        // -------------------------------------------------------------
        const dependencies = [];
        const enggTask = generatedRequests.find(r => r.departmentCode === 'ENGG');
        const trdTask = generatedRequests.find(r => r.departmentCode === 'TRD');
        if (enggTask && trdTask) {
            dependencies.push({
                taskExternalId: trdTask.externalId,
                dependsOnTaskExternalId: enggTask.externalId,
                dependencyType: 'CO_OCCURRING',
                lagMinutes: 0,
                notes: 'Integrated Block: Track tamping and OHE tower wagon co-occupy track section.'
            });
        }

        // -------------------------------------------------------------
        // 5. Realistic Train Operational Data (from COA)
        // -------------------------------------------------------------
        const trainMovements = this.generateRealisticTrains(corridorCode, hStart, hEnd, pseudoRand);

        // -------------------------------------------------------------
        // 6. Available Block Windows (from COA & BDMS)
        // -------------------------------------------------------------
        const blockWindows = this.generateRealisticWindows(corridorCode, hStart, hEnd);

        // Validate complete dataset before returning
        DemoDataValidator.validateMaintenanceRequests(generatedRequests);
        DemoDataValidator.validateAssets(generatedAssets);
        DemoDataValidator.validateDefects(generatedDefects);
        DemoDataValidator.validateTrainMovements(trainMovements);
        DemoDataValidator.validateBlockWindows(blockWindows);

        return {
            metadata: {
                corridorCode,
                dataSourceType: 'DEMO',
                sourceSystems: ['BDMS', 'TDMS', 'SMMS', 'COA'],
                generatedAt: new Date().toISOString(),
                horizonStart: hStart.toISOString(),
                horizonEnd: hEnd.toISOString(),
                counts: {
                    maintenanceRequests: generatedRequests.length,
                    assets: generatedAssets.length,
                    defects: generatedDefects.length,
                    trainMovements: trainMovements.length,
                    blockWindows: blockWindows.length,
                    dependencies: dependencies.length
                }
            },
            maintenanceRequests: generatedRequests,
            assets: generatedAssets,
            defects: generatedDefects,
            trainMovements,
            blockWindows,
            dependencies
        };
    }

    /**
     * Helper to generate realistic Indian Railways train schedules
     */
    generateRealisticTrains(corridorCode, hStart, hEnd, pseudoRand) {
        const trainCatalog = [
            { number: '12004', name: 'Lucknow Swarna Shatabdi Express', type: 'SHATABDI', priority: 1, direction: 'DOWN', rake: 'LHB', speed: 130, startHour: 6, durHours: 5.5 },
            { number: '22436', name: 'Vande Bharat Express - Varanasi', type: 'VANDE_BHARAT', priority: 1, direction: 'DOWN', rake: 'Train18', speed: 160, startHour: 6, durHours: 8 },
            { number: '12302', name: 'Howrah Rajdhani Express', type: 'RAJDHANI', priority: 1, direction: 'DOWN', rake: 'LHB', speed: 130, startHour: 16, durHours: 6.5 },
            { number: '12418', name: 'Prayagraj Superfast Express', type: 'SUPERFAST', priority: 2, direction: 'DOWN', rake: 'LHB', speed: 110, startHour: 22, durHours: 7 },
            { number: '12554', name: 'Vaishali Express', type: 'MAIL_EXPRESS', priority: 3, direction: 'UP', rake: 'ICF', speed: 100, startHour: 19, durHours: 8 },
            { number: '14164', name: 'Sangam Express', type: 'PASSENGER', priority: 4, direction: 'UP', rake: 'ICF', speed: 80, startHour: 17, durHours: 10 },
            { number: 'BOXN-883', name: 'Heavy Haul Coal Rake', type: 'FREIGHT', priority: 5, direction: 'UP', rake: 'BOXN', speed: 75, startHour: 1, durHours: 4 },
            { number: 'BCN-402', name: 'Foodgrain Covered Wagons', type: 'FREIGHT', priority: 5, direction: 'DOWN', rake: 'BCNHL', speed: 70, startHour: 2, durHours: 4.5 }
        ];

        const trains = [];
        const days = Math.max(1, Math.ceil((hEnd.getTime() - hStart.getTime()) / 86400000));

        for (let d = 0; d < Math.min(days, 5); d++) {
            const dayBase = new Date(hStart.getTime() + d * 86400000);
            dayBase.setUTCHours(0, 0, 0, 0);

            trainCatalog.forEach((trn) => {
                const startTime = new Date(dayBase.getTime() + trn.startHour * 3600000);
                const endTime = new Date(startTime.getTime() + trn.durHours * 3600000);

                if (startTime >= hStart && endTime <= hEnd) {
                    const dateTag = dayBase.toISOString().slice(0, 10).replace(/-/g, '');
                    trains.push({
                        externalId: `COA-TRN-${trn.number}-${dateTag}`,
                        corridorCode,
                        trainNumber: trn.number,
                        serviceIdentifier: `${trn.number}_${trn.name.replace(/\s+/g, '_')}_${dateTag}`,
                        scheduledStartTime: startTime.toISOString(),
                        scheduledEndTime: endTime.toISOString(),
                        direction: trn.direction,
                        trainType: trn.type,
                        priority: trn.priority,
                        status: 'SCHEDULED',
                        sourceSystem: 'COA',
                        dataSourceType: 'DEMO',
                        operationalDetails: {
                            dataSourceType: 'DEMO',
                            sourceSystem: 'COA',
                            rakeType: trn.rake,
                            maxSpeedKmph: trn.speed,
                            trafficIntensity: (trn.startHour >= 6 && trn.startHour <= 10) || (trn.startHour >= 17 && trn.startHour <= 21) ? 'HIGH' : 'LOW',
                            operatingSection: corridorCode,
                            crewDepot: trn.direction === 'DOWN' ? 'NDLS' : 'CNB'
                        }
                    });
                }
            });
        }

        return trains;
    }

    /**
     * Helper to generate realistic available block windows
     */
    generateRealisticWindows(corridorCode, hStart, hEnd) {
        const windows = [];
        const days = Math.max(1, Math.ceil((hEnd.getTime() - hStart.getTime()) / 86400000));

        for (let d = 0; d < Math.min(days, 7); d++) {
            const dayBase = new Date(hStart.getTime() + d * 86400000);
            dayBase.setUTCHours(0, 0, 0, 0);

            // Window 1: Early morning traffic block on UP Main (Low traffic hours 01:00 - 04:30)
            const win1Start = new Date(dayBase.getTime() + 1 * 3600000);
            const win1End = new Date(dayBase.getTime() + 4.5 * 3600000);
            if (win1End >= hStart && win1Start <= hEnd) {
                windows.push({
                    externalId: `COA-WIN-UP-${d + 1}`,
                    corridorCode,
                    startTime: win1Start.toISOString(),
                    endTime: win1End.toISOString(),
                    durationMinutes: 210,
                    availabilityStatus: 'AVAILABLE',
                    blockType: 'TRAFFIC_BLOCK',
                    lineDesignation: 'UP_MAIN',
                    startKm: 110.000,
                    endKm: 125.000,
                    sourceSystem: 'COA',
                    dataSourceType: 'DEMO',
                    operationalConstraints: {
                        dataSourceType: 'DEMO',
                        sourceSystem: 'COA',
                        cautionaryOrder: '30kmph caution upon resumption',
                        trafficIntensity: 'MINIMAL_NIGHT'
                    }
                });
            }

            // Window 2: Integrated Traffic + Power Block (02:00 - 05:00)
            const win2Start = new Date(dayBase.getTime() + 2 * 3600000);
            const win2End = new Date(dayBase.getTime() + 5 * 3600000);
            if (win2End >= hStart && win2Start <= hEnd) {
                windows.push({
                    externalId: `BDMS-WIN-INT-${d + 1}`,
                    corridorCode,
                    startTime: win2Start.toISOString(),
                    endTime: win2End.toISOString(),
                    durationMinutes: 180,
                    availabilityStatus: 'AVAILABLE',
                    blockType: 'INTEGRATED_BLOCK',
                    lineDesignation: 'DN_MAIN',
                    startKm: 200.000,
                    endKm: 215.000,
                    sourceSystem: 'BDMS',
                    dataSourceType: 'DEMO',
                    operationalConstraints: {
                        dataSourceType: 'DEMO',
                        sourceSystem: 'BDMS',
                        simultaneousOHE: true,
                        powerBlockPermitNumber: `PBP-TDL-${d + 1}`
                    }
                });
            }
        }

        return windows;
    }

    // -------------------------------------------------------------
    // Interface Implementations
    // -------------------------------------------------------------

    async fetchMaintenanceRequests(options = {}) {
        const dataset = this.generateDataset(options);
        return dataset.maintenanceRequests;
    }

    async getMaintenanceRequestById(requestId) {
        const dataset = this.generateDataset();
        return dataset.maintenanceRequests.find(r => r.externalId === requestId) || null;
    }

    async fetchAssets(options = {}) {
        const dataset = this.generateDataset(options);
        return dataset.assets;
    }

    async getAssetById(assetId) {
        const dataset = this.generateDataset();
        return dataset.assets.find(a => a.externalId === assetId || a.assetCode === assetId) || null;
    }

    async fetchDefects(options = {}) {
        const dataset = this.generateDataset(options);
        return dataset.defects;
    }

    async getDefectById(defectId) {
        const dataset = this.generateDataset();
        return dataset.defects.find(d => d.externalId === defectId || d.defectCode === defectId) || null;
    }

    async fetchTrainMovements(options = {}) {
        const dataset = this.generateDataset(options);
        return dataset.trainMovements;
    }

    async fetchBlockWindows(options = {}) {
        const dataset = this.generateDataset(options);
        return dataset.blockWindows;
    }
}

module.exports = new DemoDataSource();
