"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const pg_1 = require("pg");
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const child_process_1 = require("child_process");
const dotenv = __importStar(require("dotenv"));
dotenv.config();
async function run() {
    const defaultConnectionString = 'postgresql://postgres:postgres@localhost:5432/postgres';
    const targetDbName = 'travelmate';
    const targetConnectionString = process.env.DATABASE_URL || `postgresql://postgres:postgres@localhost:5432/${targetDbName}`;
    console.log('Connecting to PostgreSQL to check database existence...');
    const defaultClient = new pg_1.Client({ connectionString: defaultConnectionString });
    await defaultClient.connect();
    try {
        // Check if database exists
        const res = await defaultClient.query(`SELECT 1 FROM pg_database WHERE datname = $1`, [targetDbName]);
        if (res.rows.length === 0) {
            console.log(`Database "${targetDbName}" does not exist. Creating it...`);
            await defaultClient.query(`CREATE DATABASE ${targetDbName}`);
            console.log(`Database "${targetDbName}" created successfully.`);
        }
        else {
            console.log(`Database "${targetDbName}" already exists.`);
        }
    }
    catch (err) {
        console.error('Error checking or creating database:', err.message);
        throw err;
    }
    finally {
        await defaultClient.end();
    }
    console.log(`Connecting to "${targetDbName}" database...`);
    const targetClient = new pg_1.Client({ connectionString: targetConnectionString });
    await targetClient.connect();
    try {
        const schemaPath = path.join(__dirname, '../../db/travelmate_schema.sql');
        console.log(`Reading schema from ${schemaPath}...`);
        const sql = fs.readFileSync(schemaPath, 'utf8');
        console.log('Applying database schema DDL verbatim...');
        await targetClient.query(sql);
        console.log('Database schema applied successfully.');
        console.log('Seeding destinations and enriched itinerary template items...');
        const seedSql = `
      -- Seed Destinations
      INSERT INTO destinations (destination_id, name, description, is_active)
      VALUES 
        ('a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d', 'Manali', 'Mountain resort town in Himachal Pradesh.', true),
        ('b2c3d4e5-f67a-8b9c-0d1e-2f3a4b5c6d7e', 'Kerala', 'Beautiful backwaters and tropical coast in South India.', true),
        ('c3d4e5f6-7a8b-9c0d-1e2f-3a4b5c6d7e8f', 'Leh', 'High-altitude cold desert mountain valley in Ladakh.', true)
      ON CONFLICT (name) DO UPDATE SET description = EXCLUDED.description;

      -- Seed Manali Template Items
      DELETE FROM destination_template_items WHERE destination_id = 'a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d';
      INSERT INTO destination_template_items (destination_id, day_number, title, description, sort_order)
      VALUES
        ('a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d', 1, 'Arrival, Acclimatization & Old Manali Heritage Cafe Hopping', 'Check-in, unpack, and gather in the common room. Rest to adjust to altitude. Hike through Old Manali village to explore traditional wooden architecture, ending with riverfront dining.
Distance: 0.5 km to 1.2 km walk from hostel base.
How to Travel: 🚶 10-15 mins walking (Free). Walk down Clubhouse Road, cross the iron bridge over Manalsu river, and proceed up the cobblestone path.
Good Food: 🍕 Cafe 1947 - 4.5★ (Famous wood-fired Trout Pizza ₹550 & Ginger Lemon Honey tea ₹120. Avg cost ₹400/head); Dylan''s Toasted & Roasted (4.6★ - fresh Chocolate Cookies ₹80).
Guide: 🛡️ Vikram (ID: AAD-VIK-8920). Aadhaar Verified. Total guide split: ₹1500/day for 8 members (just ₹187.50 per traveler). Leads the village heritage walk.', 1),
        ('a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d', 2, 'Solang Valley Trek, Paragliding & Adventure Sports', 'Acclimatization trek to Solang waterfall. Optional paragliding, zorbing, or ATV rides with group buddies.
Distance: 13 km from hostel base.
How to Travel: 🚌 Take the public HRTC local bus from Mall Road bus stand to Solang (₹40/head, leaves at 08:15 AM) or rent a scooter (₹350/day + fuel) and split between 2 buddies (₹175 each).
Good Food: 🍲 Solang Ridge Cafe - 4.2★ (Try local Himachali Siddu with ghee ₹120 and hot soupy Maggi ₹60. Avg cost: ₹180/head).
Guide: 🛡️ Vikram (ID: AAD-VIK-8920). Aadhaar Verified. Cost: ₹1500/day split (₹187.50/head). Coordinates ticketing to avoid tourist scams and leads the waterfall trail.', 2),
        ('a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d', 3, 'Hadimba Temple Pine Forest Trail & Jogini Waterfall Hike', 'Scenic pine-forest hike to Hadimba Temple, transit to Vashisht village, and hike to the spectacular Jogini Falls. Relax in natural hot springs.
Distance: Hadimba Temple: 2.2 km; Jogini Falls: 4.5 km from hostel base.
How to Travel: 🌲 Walk through the scenic Pine Forest Trail to Hadimba (Free, 25 mins). For Jogini Falls, take a shared auto-rickshaw to Vashisht (₹30/head) and then hike 30 mins.
Good Food: 🍝 Il Forno - 4.4★ (Located in a heritage wood cabin. Spinach & Ricotta Ravioli ₹380 & Apple Crumble ₹180); Vashisht German Bakery (4.1★ - Yak Cheese Sandwich ₹150).
Guide: 🛡️ Vikram (ID: AAD-VIK-8920). Aadhaar Verified. Cost: ₹1500/day split (₹187.50/head). Guides along the uncrowded forest trails and helps with group photos.', 3);

      -- Seed Kerala Template Items
      DELETE FROM destination_template_items WHERE destination_id = 'b2c3d4e5-f67a-8b9c-0d1e-2f3a4b5c6d7e';
      INSERT INTO destination_template_items (destination_id, day_number, title, description, sort_order)
      VALUES
        ('b2c3d4e5-f67a-8b9c-0d1e-2f3a4b5c6d7e', 1, 'Fort Kochi Art Trail, Chinese Fishing Nets & Kathakali Night', 'Check in, meet group members, and explore the Jew Town spice market, Dutch Mattancherry Palace, and seaside nets. Attend traditional Kathakali dance show.
Distance: 1.2 km to 3.5 km walk from Fort Kochi Backpacker House.
How to Travel: 🚲 Rent a bicycle from the hostel (₹100/day) or take the budget public ferry from Fort Kochi jetty to Mattancherry (₹6/ticket).
Good Food: 🍰 Kashi Art Cafe - 4.5★ (Famous Chocolate Cake ₹180, organic Spinach Mushroom Omelette ₹220, Cold Brew ₹150); Ginger House (4.1★ - Appam with Veg Stew ₹240).
Guide: 🛡️ Anand (ID: AAD-ANA-4720). Aadhaar Verified. Cost: ₹1800/day split among 8 members (₹225/head). Anand is a local historian detailing colonial Fort Kochi.', 1),
        ('b2c3d4e5-f67a-8b9c-0d1e-2f3a4b5c6d7e', 2, 'Alleppey Backwaters Houseboat Cruise & Canal Kayaking', 'Explore the vast backwaters on a traditional wooden houseboat, then kayak through narrow channels where houseboats can''t reach.
Distance: 55 km from Ernakulam/Kochi hostel.
How to Travel: 🚌 Take the KSRTC public state transport bus from Ernakulam stand to Alleppey (₹60/head). Split a shared wooden government ferry (₹15/ticket) for canal transit.
Good Food: 🐟 Vembanad Seafood - 4.3★ (Try traditional Karimeen Pollichathu Pearl Spot fish grilled in banana leaf ₹420 and Kappa fish curry ₹180. Avg cost: ₹300/head).
Guide: 🛡️ Anand (ID: AAD-ANA-4720). Aadhaar Verified. Cost: ₹1800/day split (₹225/head). Coordinates boat rentals and guides kayaking safety.', 2),
        ('b2c3d4e5-f67a-8b9c-0d1e-2f3a4b5c6d7e', 3, 'Varkala Cliff Beach Walk & Coastal Sunset Dinner', 'Catch a morning train to Varkala. Relax on the famous cliff-bordered black sand beach, join an open beach yoga class, and enjoy fresh coastal dinner.
Distance: 160 km from Fort Kochi base.
How to Travel: 🚆 Take the local express train (Sleeper Class ₹145, 4 hrs) to Varkala Sivagiri Station, then split a shared auto-rickshaw to Varkala Cliff (₹30/head).
Good Food: ☕ Darjeeling Cafe Varkala - 4.4★ (Seafood Platter ₹650, Honey Ginger tea ₹90, Shakshuka ₹220); Clafouti Restaurant (4.2★ - Kerala style Prawn Curry ₹380).
Guide: 🛡️ Local Coastal Tour Guides (Aadhaar Verified, available on-demand). Group split cost: ₹1500/day total (₹187.50/head).', 3);

      -- Seed Leh Template Items
      DELETE FROM destination_template_items WHERE destination_id = 'c3d4e5f6-7a8b-9c0d-1e2f-3a4b5c6d7e8f';
      INSERT INTO destination_template_items (destination_id, day_number, title, description, sort_order)
      VALUES
        ('c3d4e5f6-7a8b-9c0d-1e2f-3a4b5c6d7e8f', 1, 'High-Altitude Acclimatization, Board Games & Leh Palace Sunset', 'Complete rest to adapt to 3,500m altitude (strictly non-active). Evening slow walk through Leh Main Bazar and watch the sunset from Leh Palace.
Distance: 0.8 km to 1.5 km very slow walk from hostel base.
How to Travel: 🚶 Mandatory slow walking (Free) to prevent acute mountain sickness (AMS). Avoid climbing stairs too quickly.
Good Food: 🍰 German Bakery Leh - 4.3★ (Fresh Apricot Tart ₹120, Sea Buckthorn juice ₹90, Yak Cheese Omelette ₹180); Gesmo (4.2★ - local Ladakhi Khambir bread ₹90).
Guide: 🛡️ Tashi (ID: AAD-TAS-7210). Aadhaar Verified. Cost: ₹2000/day split among 8 members (₹250/head). Tashi is a wilderness medic; checks oxygen saturation levels.', 1),
        ('c3d4e5f6-7a8b-9c0d-1e2f-3a4b5c6d7e8f', 2, 'Gravity-Defying Magnetic Hill, Sangam Confluence & Alchi Kitchen', 'Experience the optical illusion at Magnetic Hill, visit the Indus-Zanskar river confluence (Sangam), and join a local Ladakhi cooking workshop.
Distance: 28 km to 50 km from Leh town center.
How to Travel: 🚖 Hire a shared Mahindra Bolero SUV via Leh Taxi Union and split the cost between 8 members (₹450 per head return).
Good Food: 🥟 Alchi Kitchen - 4.6★ (Famous traditional pasta soup Chutagi ₹280 and sweet Apricot Mokmok dumplings ₹180. Avg cost: ₹230/head).
Guide: 🛡️ Tashi (ID: AAD-TAS-7210). Aadhaar Verified. Cost: ₹2000/day split (₹250/head). Manages vehicle union check-posts and leads the Zanskar river walk.', 2),
        ('c3d4e5f6-7a8b-9c0d-1e2f-3a4b5c6d7e8f', 3, 'Pangong Tso High-Altitude Saltwater Lake & Shanti Stupa Sunset', 'Drive crossing the high Chang La Pass (5,360m) to the famous deep blue Pangong saltwater lake. Return to Leh for a panoramic sunset at Shanti Stupa.
Distance: 220 km from Leh town base.
How to Travel: 🚖 Shared Toyota Innova SUV split between 8 members (₹1800 per head return). Shanti Stupa is a 20-min climb up 500 stairs from Leh center (Free).
Good Food: 🍜 Pangong Lake View Camp - 4.1★ (Hot Soupy Maggi ₹80 & Tibetan Thukpa ₹160); The Tibetan Kitchen Leh (4.5★ - steamed Mutton Momos ₹240, Tingmo steamed bread ₹60).
Guide: 🛡️ Tashi (ID: AAD-TAS-7210). Aadhaar Verified. Cost: ₹2000/day split (₹250/head). Manages border inner-line permits (ILPs) and monitors medical health kits.', 3);
    `;
        await targetClient.query(seedSql);
        console.log('Destinations and enriched itinerary template items seeded successfully.');
    }
    catch (err) {
        console.error('Error applying database schema:', err.message);
        throw err;
    }
    finally {
        await targetClient.end();
    }
    try {
        console.log('Running Prisma DB pull (introspection)...');
        try {
            (0, child_process_1.execSync)('npx prisma db pull', { stdio: 'inherit' });
        }
        catch (e) {
            console.warn('[Prisma Warning] DB pull failed (continuing):', e.message);
        }
        console.log('Running Prisma Client generation...');
        try {
            (0, child_process_1.execSync)('npx prisma generate', { stdio: 'inherit' });
        }
        catch (e) {
            console.warn('[Prisma Warning] Client generation failed (this is expected if local server is active and locking query engine):', e.message);
        }
        console.log('Migration completed successfully!');
    }
    catch (err) {
        console.error('Error running Prisma sync:', err.message);
        throw err;
    }
}
run().catch((err) => {
    console.error('Migration failed:', err);
    process.exit(1);
});
