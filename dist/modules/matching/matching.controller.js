"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runMatching = runMatching;
const matching_service_1 = require("../../services/matching.service");
async function runMatching(req, res) {
    try {
        const groupsFormed = await (0, matching_service_1.runMatchingProcess)();
        res.status(200).json({
            code: 'SUCCESS',
            message: 'Matching optimization pipeline completed.',
            groups_formed: groupsFormed
        });
    }
    catch (err) {
        console.error('Matching controller trigger failed:', err);
        res.status(500).json({
            code: 'LOCK_OR_INTERNAL_ERROR',
            message: err.message || 'An error occurred during matching optimization.'
        });
    }
}
