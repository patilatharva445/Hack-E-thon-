// ============================================
// Indoor Navigation — Pathfinding Engine
// Uses Dijkstra's algorithm for shortest path
// ============================================

/**
 * Build an adjacency list graph from map edges.
 * @param {Array} nodes - Array of node objects
 * @param {Array} edges - Array of edge objects with from, to, distance, instruction
 * @returns {Object} adjacency list: { nodeId: [{ neighbor, distance, instruction }] }
 */
function buildGraph(nodes, edges) {
    const graph = {};

    // Initialize all nodes
    for (const node of nodes) {
        graph[node.id] = [];
    }

    // Add edges (bidirectional)
    for (const edge of edges) {
        graph[edge.from].push({
            neighbor: edge.to,
            distance: edge.distance,
            instruction: edge.instruction,
        });

        // Reverse direction — generate a reverse instruction
        graph[edge.to].push({
            neighbor: edge.from,
            distance: edge.distance,
            instruction: reverseInstruction(edge.instruction, nodes, edge.from),
        });
    }

    return graph;
}

/**
 * Generate a reverse instruction for the opposite direction.
 */
function reverseInstruction(instruction, nodes, targetId) {
    const targetNode = nodes.find((n) => n.id === targetId);
    const targetName = targetNode ? targetNode.name : targetId;

    // Simple reversal heuristics
    if (instruction.includes("Turn left")) {
        return instruction.replace("Turn left", "Turn right");
    }
    if (instruction.includes("Turn right")) {
        return instruction.replace("Turn right", "Turn left");
    }
    return `Head towards ${targetName}`;
}

/**
 * Dijkstra's shortest path algorithm.
 * @param {Object} graph - Adjacency list from buildGraph()
 * @param {string} startId - Starting node ID
 * @param {string} endId - Destination node ID
 * @returns {Object} { path: [nodeIds], totalDistance: number } or null if no path
 */
function dijkstra(graph, startId, endId) {
    const distances = {};
    const previous = {};
    const visited = new Set();
    const queue = []; // Simple priority queue using array

    // Initialize distances
    for (const nodeId of Object.keys(graph)) {
        distances[nodeId] = Infinity;
        previous[nodeId] = null;
    }

    distances[startId] = 0;
    queue.push({ id: startId, distance: 0 });

    while (queue.length > 0) {
        // Get node with smallest distance
        queue.sort((a, b) => a.distance - b.distance);
        const current = queue.shift();

        if (visited.has(current.id)) continue;
        visited.add(current.id);

        // Found destination
        if (current.id === endId) {
            break;
        }

        // Explore neighbors
        for (const edge of graph[current.id]) {
            if (visited.has(edge.neighbor)) continue;

            const newDist = distances[current.id] + edge.distance;
            if (newDist < distances[edge.neighbor]) {
                distances[edge.neighbor] = newDist;
                previous[edge.neighbor] = current.id;
                queue.push({ id: edge.neighbor, distance: newDist });
            }
        }
    }

    // Reconstruct path
    if (distances[endId] === Infinity) {
        return null; // No path found
    }

    const path = [];
    let current = endId;
    while (current !== null) {
        path.unshift(current);
        current = previous[current];
    }

    return {
        path,
        totalDistance: distances[endId],
    };
}

/**
 * Generate human-readable, voice-friendly turn-by-turn directions.
 * @param {Array} path - Ordered array of node IDs from dijkstra()
 * @param {Object} graph - Adjacency list
 * @param {Array} nodes - Original node objects
 * @returns {Array} Array of direction step objects
 */
function generateDirections(path, graph, nodes) {
    if (!path || path.length < 2) {
        return [{ step: 1, instruction: "You are already at your destination.", nodeId: path?.[0] || null }];
    }

    const nodeMap = {};
    for (const node of nodes) {
        nodeMap[node.id] = node;
    }

    const directions = [];
    let stepNum = 1;

    // Starting point
    const startNode = nodeMap[path[0]];
    directions.push({
        step: stepNum++,
        instruction: `Start at ${startNode.name}.`,
        nodeId: path[0],
        type: "start",
    });

    // Navigate through each edge
    for (let i = 0; i < path.length - 1; i++) {
        const fromId = path[i];
        const toId = path[i + 1];
        const toNode = nodeMap[toId];

        // Find the edge instruction
        const edge = graph[fromId].find((e) => e.neighbor === toId);
        const instruction = edge ? edge.instruction : `Continue to ${toNode.name}`;

        const isDestination = i === path.length - 2;

        directions.push({
            step: stepNum++,
            instruction: instruction + (isDestination ? ". You have arrived!" : "."),
            nodeId: toId,
            distance: edge ? edge.distance : 0,
            type: isDestination ? "destination" : "waypoint",
        });
    }

    return directions;
}

// Export for use in server.js
module.exports = { buildGraph, dijkstra, generateDirections };
