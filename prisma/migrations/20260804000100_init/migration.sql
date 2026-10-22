CREATE TABLE `SimulationRun` (
    `id` VARCHAR(191) NOT NULL,
    `seed` INTEGER NOT NULL,
    `mode` ENUM('rl', 'baseline', 'compare') NOT NULL,
    `status` ENUM('running', 'stopped', 'completed') NOT NULL DEFAULT 'running',
    `step` INTEGER NOT NULL DEFAULT 0,
    `episode` INTEGER NOT NULL DEFAULT 0,
    `epsilon` DOUBLE NOT NULL,
    `rlControlState` JSON NOT NULL,
    `baseControlState` JSON NOT NULL,
    `startedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `endedAt` DATETIME(3) NULL,
    INDEX `SimulationRun_status_startedAt_idx`(`status`, `startedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `MetricSnapshot` (
    `id` VARCHAR(191) NOT NULL,
    `runId` VARCHAR(191) NOT NULL,
    `timestamp` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `step` INTEGER NOT NULL,
    `latencyMs` DOUBLE NOT NULL,
    `p95LatencyMs` DOUBLE NOT NULL,
    `throughput` DOUBLE NOT NULL,
    `cpuPct` DOUBLE NOT NULL,
    `memPct` DOUBLE NOT NULL,
    `requestRate` DOUBLE NOT NULL,
    `networkLatencyMs` DOUBLE NOT NULL,
    `cacheHitRatio` DOUBLE NOT NULL,
    `slaViolation` BOOLEAN NOT NULL,
    `costPerThousandUsd` DOUBLE NOT NULL,
    `source` ENUM('rl', 'baseline') NOT NULL,
    INDEX `MetricSnapshot_runId_source_timestamp_idx`(`runId`, `source`, `timestamp`),
    UNIQUE INDEX `MetricSnapshot_runId_step_source_key`(`runId`, `step`, `source`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `AgentAction` (
    `id` VARCHAR(191) NOT NULL,
    `runId` VARCHAR(191) NOT NULL,
    `timestamp` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `step` INTEGER NOT NULL,
    `stateBucket` JSON NOT NULL,
    `stateKey` VARCHAR(191) NOT NULL,
    `action` VARCHAR(191) NOT NULL,
    `reason` TEXT NOT NULL,
    `rewardResult` DOUBLE NOT NULL,
    `source` ENUM('rl', 'baseline') NOT NULL,
    `effect` JSON NOT NULL,
    `infrastructure` JSON NULL,
    INDEX `AgentAction_runId_source_timestamp_idx`(`runId`, `source`, `timestamp`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `QTableEntry` (
    `id` VARCHAR(191) NOT NULL,
    `stateKey` VARCHAR(191) NOT NULL,
    `action` VARCHAR(191) NOT NULL,
    `qValue` DOUBLE NOT NULL DEFAULT 0,
    `visits` INTEGER NOT NULL DEFAULT 0,
    `updatedAt` DATETIME(3) NOT NULL,
    INDEX `QTableEntry_qValue_idx`(`qValue`),
    UNIQUE INDEX `QTableEntry_stateKey_action_key`(`stateKey`, `action`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `AppSetting` (
    `key` VARCHAR(191) NOT NULL,
    `value` TEXT NOT NULL,
    `updatedAt` DATETIME(3) NOT NULL,
    PRIMARY KEY (`key`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `MetricSnapshot` ADD CONSTRAINT `MetricSnapshot_runId_fkey` FOREIGN KEY (`runId`) REFERENCES `SimulationRun`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `AgentAction` ADD CONSTRAINT `AgentAction_runId_fkey` FOREIGN KEY (`runId`) REFERENCES `SimulationRun`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
