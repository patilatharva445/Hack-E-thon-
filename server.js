// ============================================
// Indoor Navigation — Express Backend Server
// ============================================

const express = require("express");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
const { buildGraph, dijkstra, generateDirections } = require("./logic");

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Serve static frontend files
app.use(express.static(path.join(__dirname, "public")));

// Load building map data
let mapData;
try {
    const rawData = fs.readFileSync(
        path.join(__dirname, "data", "building-map.json"),
        "utf-8"
    );
    mapData = JSON.parse(rawData);
    console.log(
        `✅ Loaded ${mapData.buildings.length} building(s) from map data`
    );
} catch (err) {
    console.error("❌ Failed to load building map data:", err.message);
    process.exit(1);
}

// Pre-build graphs for each floor of each building
const graphs = {};
for (const building of mapData.buildings) {
    for (const floor of building.floors) {
        const key = `${building.id}::${floor.id}`;
        graphs[key] = buildGraph(floor.nodes, floor.edges);
        console.log(
            `  📍 Built graph for ${building.name} — ${floor.name} (${floor.nodes.length} nodes)`
        );
    }
}

// ============================================
// API Routes
// ============================================

/**
 * GET /api/buildings
 * Returns list of all available buildings
 */
app.get("/api/buildings", (req, res) => {
    const buildings = mapData.buildings.map((b) => ({
        id: b.id,
        name: b.name,
        floorCount: b.floors.length,
    }));
    res.json({ buildings });
});

/**
 * GET /api/locations/:buildingId
 * Returns all navigable locations in a building
 * Optional query param: ?floor=floor-1
 */
app.get("/api/locations/:buildingId", (req, res) => {
    const building = mapData.buildings.find(
        (b) => b.id === req.params.buildingId
    );
    if (!building) {
        return res.status(404).json({ error: "Building not found" });
    }

    const floorId = req.query.floor;
    let floors = building.floors;
    if (floorId) {
        floors = floors.filter((f) => f.id === floorId);
    }

    const locations = [];
    for (const floor of floors) {
        for (const node of floor.nodes) {
            locations.push({
                id: node.id,
                name: node.name,
                type: node.type,
                floor: floor.id,
                floorName: floor.name,
                x: node.x,
                y: node.y,
                landmark: node.landmark || false,
            });
        }
    }

    res.json({ buildingId: building.id, buildingName: building.name, locations });
});

/**
 * POST /api/navigate
 * Compute shortest path and return turn-by-turn directions
 * Body: { buildingId, floorId, from, to }
 */
app.post("/api/navigate", (req, res) => {
    const { buildingId, floorId, from, to } = req.body;

    // Validation
    if (!buildingId || !floorId || !from || !to) {
        return res.status(400).json({
            error: "Missing required fields: buildingId, floorId, from, to",
        });
    }

    if (from === to) {
        return res.json({
            path: [from],
            totalDistance: 0,
            directions: [
                {
                    step: 1,
                    instruction: "You are already at your destination.",
                    nodeId: from,
                    type: "start",
                },
            ],
        });
    }

    const graphKey = `${buildingId}::${floorId}`;
    const graph = graphs[graphKey];
    if (!graph) {
        return res.status(404).json({ error: "Building or floor not found" });
    }

    // Get floor data for node details
    const building = mapData.buildings.find((b) => b.id === buildingId);
    const floor = building.floors.find((f) => f.id === floorId);

    // Validate nodes exist
    if (!graph[from]) {
        return res
            .status(400)
            .json({ error: `Start location '${from}' not found on this floor` });
    }
    if (!graph[to]) {
        return res
            .status(400)
            .json({ error: `Destination '${to}' not found on this floor` });
    }

    // Run pathfinding
    const result = dijkstra(graph, from, to);
    if (!result) {
        return res.status(404).json({
            error: "No path found between the specified locations",
        });
    }

    // Generate directions
    const directions = generateDirections(result.path, graph, floor.nodes);

    // Build path coordinates for map rendering
    const pathCoords = result.path.map((nodeId) => {
        const node = floor.nodes.find((n) => n.id === nodeId);
        return { id: nodeId, name: node.name, x: node.x, y: node.y };
    });

    res.json({
        path: result.path,
        pathCoords,
        totalDistance: result.totalDistance,
        directions,
    });
});

/**
 * GET /api/map/:buildingId/:floorId
 * Returns full map data (nodes + edges) for SVG rendering
 */
app.get("/api/map/:buildingId/:floorId", (req, res) => {
    const building = mapData.buildings.find(
        (b) => b.id === req.params.buildingId
    );
    if (!building) {
        return res.status(404).json({ error: "Building not found" });
    }

    const floor = building.floors.find((f) => f.id === req.params.floorId);
    if (!floor) {
        return res.status(404).json({ error: "Floor not found" });
    }

    res.json({
        buildingId: building.id,
        buildingName: building.name,
        floor: {
            id: floor.id,
            name: floor.name,
            nodes: floor.nodes,
            edges: floor.edges,
        },
    });
});

// Fallback: serve index.html for any non-API route
app.get("*", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "index.html"));
});

// Start server
app.listen(PORT, () => {
    console.log(`\n🧭 Indoor Navigation Server running at http://localhost:${PORT}`);
    console.log(`   API endpoints:`);
    console.log(`   GET  /api/buildings`);
    console.log(`   GET  /api/locations/:buildingId`);
    console.log(`   GET  /api/map/:buildingId/:floorId`);
    console.log(`   POST /api/navigate\n`);
});
