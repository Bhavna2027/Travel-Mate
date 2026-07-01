"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getProfile = getProfile;
exports.updateProfile = updateProfile;
exports.deleteProfile = deleteProfile;
const client_1 = require("../../db/client");
async function getProfile(req, res) {
    try {
        const userId = req.user?.user_id;
        if (!userId) {
            res.status(401).json({ code: 'UNAUTHORIZED', message: 'Not authenticated.' });
            return;
        }
        const user = await client_1.prisma.users.findUnique({
            where: { user_id: userId },
            include: {
                user_profiles: true,
                emergency_contacts: true,
                group_members: true
            }
        });
        if (!user || user.deleted_at) {
            res.status(404).json({ code: 'USER_NOT_FOUND', message: 'User not found.' });
            return;
        }
        const profile = user.user_profiles[0] || {};
        res.status(200).json({
            user_id: user.user_id,
            name: user.name,
            email: user.email,
            phone: user.phone,
            verification_status: user.verification_status,
            trust_score: Number(user.trust_score),
            created_at: user.created_at,
            gender: user.gender,
            age: user.age,
            travel_styles: user.travel_styles,
            languages: user.languages,
            device_info: user.device_info,
            is_guide: user.is_guide,
            bio: profile.bio || null,
            profile_picture_url: profile.profile_picture_url || null,
            interests: profile.interests || [],
            travel_experience: profile.travel_experience || null,
            preferred_accommodation: profile.preferred_accommodation || null,
            group_members: user.group_members.map(gm => ({
                group_id: gm.group_id,
                user_id: gm.user_id,
                role: gm.role,
                status: gm.status
            })),
            emergency_contacts: user.emergency_contacts.map(c => ({
                id: c.id,
                name: c.name,
                relationship: c.relationship,
                phone: c.phone,
                is_primary: c.is_primary
            }))
        });
    }
    catch (err) {
        console.error('Get profile error:', err);
        res.status(500).json({ code: 'INTERNAL_ERROR', message: 'An internal error occurred.' });
    }
}
async function updateProfile(req, res) {
    try {
        const userId = req.user?.user_id;
        if (!userId) {
            res.status(401).json({ code: 'UNAUTHORIZED', message: 'Not authenticated.' });
            return;
        }
        const { name, age, gender, gender_preference, travel_styles, languages, device_info, bio, profile_picture_url, interests, travel_experience, preferred_accommodation, emergency_contacts } = req.body;
        // Validate checks
        if (age !== undefined && (age < 18 || age > 100)) {
            res.status(400).json({ code: 'INVALID_INPUT', message: 'Age must be between 18 and 100.' });
            return;
        }
        if (gender && !['M', 'F', 'Other'].includes(gender)) {
            res.status(400).json({ code: 'INVALID_INPUT', message: 'Gender must be M, F, or Other.' });
            return;
        }
        if (gender_preference && !['women-only', 'mixed', 'men-only'].includes(gender_preference)) {
            res.status(400).json({ code: 'INVALID_INPUT', message: 'Gender preference must be women-only, mixed, or men-only.' });
            return;
        }
        if (travel_experience && !['beginner', 'intermediate', 'expert'].includes(travel_experience)) {
            res.status(400).json({ code: 'INVALID_INPUT', message: 'Travel experience must be beginner, intermediate, or expert.' });
            return;
        }
        if (preferred_accommodation && !['hostel', 'hotel', 'resort', 'camping'].includes(preferred_accommodation)) {
            res.status(400).json({ code: 'INVALID_INPUT', message: 'Preferred accommodation must be hostel, hotel, resort, or camping.' });
            return;
        }
        const updatedUser = await client_1.prisma.$transaction(async (tx) => {
            // 1. Update core User details
            const userUpdateData = {};
            if (name !== undefined)
                userUpdateData.name = name;
            if (age !== undefined)
                userUpdateData.age = parseInt(age);
            if (gender !== undefined)
                userUpdateData.gender = gender;
            if (gender_preference !== undefined)
                userUpdateData.gender_preference = gender_preference;
            if (travel_styles !== undefined)
                userUpdateData.travel_styles = travel_styles;
            if (languages !== undefined)
                userUpdateData.languages = languages;
            if (device_info !== undefined)
                userUpdateData.device_info = device_info;
            const u = await tx.users.update({
                where: { user_id: userId },
                data: userUpdateData
            });
            // 2. Update User Profile
            const profileUpdateData = {};
            if (bio !== undefined)
                profileUpdateData.bio = bio;
            if (profile_picture_url !== undefined)
                profileUpdateData.profile_picture_url = profile_picture_url;
            if (interests !== undefined)
                profileUpdateData.interests = interests;
            if (travel_experience !== undefined)
                profileUpdateData.travel_experience = travel_experience;
            if (preferred_accommodation !== undefined)
                profileUpdateData.preferred_accommodation = preferred_accommodation;
            const userProfile = await tx.user_profiles.findFirst({ where: { user_id: userId } });
            if (userProfile) {
                await tx.user_profiles.update({
                    where: { profile_id: userProfile.profile_id },
                    data: profileUpdateData
                });
            }
            else {
                await tx.user_profiles.create({
                    data: {
                        user_id: userId,
                        ...profileUpdateData
                    }
                });
            }
            // 3. Update Emergency Contacts (replace all)
            if (emergency_contacts !== undefined && Array.isArray(emergency_contacts)) {
                await tx.emergency_contacts.deleteMany({ where: { user_id: userId } });
                for (const contact of emergency_contacts) {
                    if (contact.name && contact.phone) {
                        await tx.emergency_contacts.create({
                            data: {
                                user_id: userId,
                                name: contact.name,
                                phone: contact.phone,
                                relationship: contact.relationship || null,
                                is_primary: contact.is_primary || false
                            }
                        });
                    }
                }
            }
            return tx.users.findUnique({
                where: { user_id: userId },
                include: {
                    user_profiles: true,
                    emergency_contacts: true
                }
            });
        });
        if (!updatedUser) {
            res.status(404).json({ code: 'USER_NOT_FOUND', message: 'User not found.' });
            return;
        }
        const profile = updatedUser.user_profiles[0] || {};
        res.status(200).json({
            user_id: updatedUser.user_id,
            name: updatedUser.name,
            email: updatedUser.email,
            phone: updatedUser.phone,
            verification_status: updatedUser.verification_status,
            trust_score: Number(updatedUser.trust_score),
            created_at: updatedUser.created_at,
            gender: updatedUser.gender,
            age: updatedUser.age,
            travel_styles: updatedUser.travel_styles,
            languages: updatedUser.languages,
            device_info: updatedUser.device_info,
            is_guide: updatedUser.is_guide,
            bio: profile.bio || null,
            profile_picture_url: profile.profile_picture_url || null,
            interests: profile.interests || [],
            travel_experience: profile.travel_experience || null,
            preferred_accommodation: profile.preferred_accommodation || null,
            emergency_contacts: updatedUser.emergency_contacts.map(c => ({
                id: c.id,
                name: c.name,
                relationship: c.relationship,
                phone: c.phone,
                is_primary: c.is_primary
            }))
        });
    }
    catch (err) {
        console.error('Update profile error:', err);
        res.status(500).json({ code: 'INTERNAL_ERROR', message: 'An internal error occurred.' });
    }
}
async function deleteProfile(req, res) {
    try {
        const userId = req.user?.user_id;
        if (!userId) {
            res.status(401).json({ code: 'UNAUTHORIZED', message: 'Not authenticated.' });
            return;
        }
        // Soft delete: update deleted_at
        await client_1.prisma.users.update({
            where: { user_id: userId },
            data: { deleted_at: new Date() }
        });
        // Revoke all sessions
        await client_1.prisma.sessions.updateMany({
            where: { user_id: userId },
            data: { revoked_at: new Date() }
        });
        res.status(200).json({ message: 'User profile soft-deleted successfully.' });
    }
    catch (err) {
        console.error('Delete profile error:', err);
        res.status(500).json({ code: 'INTERNAL_ERROR', message: 'An internal error occurred.' });
    }
}
