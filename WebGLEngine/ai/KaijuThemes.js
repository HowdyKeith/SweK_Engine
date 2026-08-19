// ============================================================================
// ai/KaijuThemes.js
//
// Round 176 — themed roster definitions. Each theme is a named set of
// kaiju entries; each entry is a prompt bundle the roster generator
// pipes through the full AI pipeline (narrative → OBJ → texture →
// Trellis → registered material set).
//
// The naming convention is "close-enough" rather than exact: we don't
// reference trademarked characters. The user can drop in new themes
// (Terminator-ish, alien hive, gobots, etc.) by appending objects
// to the THEMES array — no plumbing changes needed.
//
// Template for adding a theme:
//   {
//     id: "snake_case_id",
//     displayName: "Title For The Dropdown",
//     description: "One-line gloss.",
//     entries: [
//       {
//         displayName: "Human-readable name",
//         entityKind: "kaiju_water" | "kaiju_hell" | etc.,
//         description: "Visual description for prompts",
//         // Optional overrides (otherwise derived from description):
//         narrativePrompt: "...",
//         objPrompt: "...",
//         texturePrompt: "...",
//       },
//       ...
//     ]
//   }
//
// The roster runner derives prompts from `description` when overrides
// aren't given. That's the path of least resistance for adding new
// themes — just write a description and let the bench's prompt-builder
// handle the rest.
// ============================================================================

// Built-in: "Kaiju Classic Foes." Eight entries inspired by Godzilla-
// franchise antagonists but renamed with serial-numbers-filed-off.
// Coverage spans all 7 kaiju entity kinds + one duplicate so material
// sets land on every kind for the live parallax preview to cycle.
const KAIJU_CLASSIC_FOES = {
    id:          "kaiju_classic_foes",
    displayName: "Kaiju Classic Foes",
    description: "Eight legendary monsters in the spirit of the great Showa-era roster.",
    entries: [
        {
            displayName: "Tri-Crowned Lightning Wyrm",
            entityKind:  "kaiju_space",
            description: "A vast three-headed dragon, each crowned skull crackling with golden electricity. Bat-like wings span the sky, scales mirror-bright, lightning arcs between the heads.",
        },
        {
            displayName: "Cosmic Moth Empress",
            entityKind:  "kaiju_sky",
            description: "A serene gigantic moth with shimmering bioluminescent wings patterned like cathedral glass. Wings glow soft blue and gold; feathered antennae trail trails of pollen-light.",
        },
        {
            displayName: "Iron Counter-Kaiju",
            entityKind:  "kaiju_tech",
            description: "A bipedal mechanical war machine built to fight kaiju. Riveted steel plating, exposed hydraulics, glowing yellow visor, missile pods on the shoulders, brutalist industrial silhouette.",
        },
        {
            displayName: "Crystal Lattice Devourer",
            entityKind:  "kaiju_hell",
            description: "A skeletal kaiju overgrown with radiating violet crystal spines. Translucent body lit from within by molten cores, crystal lattice extending across the back like spear-fields.",
        },
        {
            displayName: "Sludge Tide",
            entityKind:  "kaiju_underground",
            description: "An amorphous toxic blob of dripping black sludge with glowing red eye-points. Surface bubbles and oozes; partly held together by a skeletal frame of broken industrial pipes.",
        },
        {
            displayName: "Ancient Stone Guardian",
            entityKind:  "kaiju_cave",
            description: "A weathered stone golem in the shape of a temple-lion. Surface carved with eroded glyphs, glowing seams of green light along the joints, vine-overgrown shoulders.",
        },
        {
            displayName: "Magma Shell Walker",
            entityKind:  "kaiju_hell",   // dup with crystal devourer — kaiju_hell gets 2
            description: "A massive tortoise-like kaiju with a glowing volcanic shell. Cracks across the shell vent fire and smoke; molten lava rivers run down the back; head sheathed in basalt.",
        },
        {
            displayName: "Abyssal Tentacle King",
            entityKind:  "kaiju_water",
            description: "A deep-ocean kaiju with a bulbous bioluminescent body and many writhing tentacles. Pulsing blue veins under translucent skin, a single huge cyclopean eye, suckers ringed with teeth.",
        },
    ],
};

// Round 184 — themes populated. Each roster has 6-8 entries spread
// across the available entityKind slots (kaiju_space/sky/tech/hell/
// underground/cave/water) so the engine has variety regardless of which
// theme the user picks. Descriptions follow the same shape as the
// classic foes: 1-2 vivid sentences, concrete physical detail, no
// narrative voice (those come from the narrativePrompt builder).
const ALIEN_HIVE_TEMPLATE = {
    id:          "alien_hive",
    displayName: "Alien Hive",
    description: "Insect-like alien biology — chitinous carapaces, brood mothers, drone swarms, acid-spitting workers.",
    entries: [
        {
            displayName: "Brood Mother",
            entityKind:  "kaiju_underground",
            description: "An immense bulbous queen kaiju with a distended translucent egg sac, chitinous black thorax, and six pincered limbs. Veined membranes pulse with embryonic light; trailing filaments leak amniotic ichor.",
        },
        {
            displayName: "Carapace Drone",
            entityKind:  "kaiju_cave",
            description: "A six-legged worker the size of a tank, armored in segmented dark-green chitin. Faceted compound eyes wrap the head; mandibles drip corrosive resin; wing nubs flex with every step.",
        },
        {
            displayName: "Spireling Acidcaster",
            entityKind:  "kaiju_hell",
            description: "A tall arched insect-form kaiju with a spiraled horn-tube launcher on its back. Pale yellow exoskeleton mottled with rust, hunched stance, leaks of bright green acid sizzling at the joints.",
        },
        {
            displayName: "Skythorn Ovipositor",
            entityKind:  "kaiju_sky",
            description: "A four-winged dragonfly kaiju with a long needle-tipped abdomen. Iridescent wings shed scale-dust in flight; the ovipositor barb glistens with a paralytic neurotoxin.",
        },
        {
            displayName: "Subterrene Burrowmaw",
            entityKind:  "kaiju_underground",
            description: "A massive serpentine borer with concentric circular jaws lined with grinding chitin plates. Eyeless head, segmented worm-body wrapped in dorsal spines, hot steam venting from its sides.",
        },
        {
            displayName: "Hive Colossus",
            entityKind:  "kaiju_tech",
            description: "A walking living fortress — kaiju-sized warrior caste with a turret-shaped head, four armored arms ending in scythe claws, and shoulder mounds that vent angry drone swarms.",
        },
    ],
};

const TRANSFORMING_ROBOTS_TEMPLATE = {
    id:          "transforming_robots",
    displayName: "Transforming Robots",
    description: "Sentient mechanical warriors that shift between vehicle and humanoid form — angular plating, kibble at the joints, glowing optic visors.",
    entries: [
        {
            displayName: "Convoy Prime",
            entityKind:  "kaiju_tech",
            description: "A heroic humanoid mech assembled from semi-truck parts. Red and blue armored plating, smokestacks on the shoulders, a windshield-paneled chest, and tire-tread kibble on the calves.",
        },
        {
            displayName: "Wing Commander",
            entityKind:  "kaiju_sky",
            description: "A jet-fighter mech mid-transformation: humanoid torso with swept-back wing assemblies on the back, afterburner nacelles for forearms, and a sharp visor where the cockpit canopy folds open.",
        },
        {
            displayName: "Saboteur Coupe",
            entityKind:  "kaiju_underground",
            description: "A lean black-and-purple humanoid robot folded down to half-size, sports-car panels forming its hunched shoulders. Visor split into two glowing red slits; spring-loaded arm blades extend from the forearms.",
        },
        {
            displayName: "Tank Berserker",
            entityKind:  "kaiju_hell",
            description: "A barrel-chested mech assembled from main battle tank components. Treads wrap the legs from hip to ankle, a smoking turret cannon arches over the right shoulder, and chunky armor skirts the waist.",
        },
        {
            displayName: "Submarine Leviathan",
            entityKind:  "kaiju_water",
            description: "An aquatic mech with a long teardrop hull running down its back. Propeller shrouds form the heels, dive-plane fins fan from the forearms, and a periscope-style optical sensor swivels above the head.",
        },
        {
            displayName: "Excavator Behemoth",
            entityKind:  "kaiju_cave",
            description: "A heavy-construction mech with a massive shovel-arm hand replacing the right forearm. Hydraulic cylinders bulge at every joint; yellow and black caution stripes run across the chest plating.",
        },
        {
            displayName: "Drone Cluster",
            entityKind:  "kaiju_space",
            description: "A modular orbital mech composed of six independent drone segments that magnetically clamp into a humanoid silhouette. Solar-panel wings unfold from the back; each segment glows with a different colored core.",
        },
    ],
};

const TERMINATOR_THEME_TEMPLATE = {
    id:          "endoskeleton_hunters",
    displayName: "Endoskeleton Hunters",
    description: "Cybernetic killers built around chromed skeletal frames — exposed servos, glowing red optics, hunter-killer silhouettes.",
    entries: [
        {
            displayName: "Hunter-Killer Endoframe",
            entityKind:  "kaiju_tech",
            description: "A polished chrome humanoid skeleton, gun-metal joints, ribcage-style torso cage, two glowing red ocular sensors recessed in a fleshless skull. Walks with deliberate menace; hydraulic whine at every step.",
        },
        {
            displayName: "Tracker Hound",
            entityKind:  "kaiju_underground",
            description: "A quadrupedal endoskeleton built like a wolfhound. Bare metal ribs, sensor array where the muzzle would be, exposed spinal actuators, two pairs of legs ending in tungsten-tipped grappling claws.",
        },
        {
            displayName: "Plasma Centurion",
            entityKind:  "kaiju_hell",
            description: "A heavily-armed endoskeleton with a shoulder-mounted plasma rifle and a glowing reactor lattice in place of a chest. Carbon-scored armor plates over the upper body, exposed servo-bones below the waist.",
        },
        {
            displayName: "Aerial Stalker",
            entityKind:  "kaiju_sky",
            description: "A vaguely humanoid endoskeleton with twin VTOL turbofans replacing the calves, two telescoping observation arms in addition to its main pair, and a featureless lens-grid head that scans in slow arcs.",
        },
        {
            displayName: "Aquatic Liquidator",
            entityKind:  "kaiju_water",
            description: "A streamlined endoskeleton with hydrodynamic chrome plating and webbed phalanges. Glowing red optic strip wrapping the head laterally; harpoon launcher integrated into the right forearm.",
        },
        {
            displayName: "Spire Climber",
            entityKind:  "kaiju_cave",
            description: "An insectile six-limbed endoframe designed for vertical surfaces — narrow torso, four climbing limbs, two manipulator arms, and grip-spikes covering every digit. Single cyclopean red optic dominates the head.",
        },
        {
            displayName: "Heavy Reaper",
            entityKind:  "kaiju_space",
            description: "A massive bipedal endoskeleton with overbuilt shoulder pauldrons, a head sunken between the shoulders, and an arm-mounted scythe of crackling energy. Black-chromed plating, asymmetric battle damage exposing the inner skeletal frame.",
        },
    ],
};

export const THEMES = [
    KAIJU_CLASSIC_FOES,
    ALIEN_HIVE_TEMPLATE,
    TRANSFORMING_ROBOTS_TEMPLATE,
    TERMINATOR_THEME_TEMPLATE,
];

// Prompt builders — derive sensible prompts from an entry's description
// when the entry doesn't supply its own. Kept here (not in the demo)
// so other UIs can reuse them.
export function narrativePrompt(entry) {
    if (entry.narrativePrompt) return entry.narrativePrompt;
    return `You are a sci-fi narrator describing a kaiju emerging.\n` +
           `Subject: ${entry.displayName}. ${entry.description}\n` +
           `Write 2-3 atmospheric sentences as it makes its first appearance. Vivid, present tense.`;
}

export function objPrompt(entry) {
    if (entry.objPrompt) return entry.objPrompt;
    // The C3D model expects a concise subject prompt and produces
    // Python that defines the geometry. Less is more here — the model
    // tends to do better with single-line directives.
    return entry.displayName + ": " + entry.description;
}

export function texturePrompt(entry) {
    if (entry.texturePrompt) return entry.texturePrompt;
    // Stable Diffusion 1.5 at 512 — diffuser likes tactile material
    // language and grounded visual nouns. Append "seamless texture"
    // so the diffuser treats it as a material rather than a portrait.
    return `Seamless texture for: ${entry.displayName}. ${entry.description} ` +
           `Surface detail, high contrast, photographic, tileable, sharp focus.`;
}

// Lookup helper for the demo
export function findTheme(id) {
    return THEMES.find(t => t.id === id) ?? null;
}
