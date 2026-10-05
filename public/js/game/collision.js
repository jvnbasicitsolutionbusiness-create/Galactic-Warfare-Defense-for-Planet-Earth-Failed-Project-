/**
 * Garden Warfare: Reborn — Collision & Detection
 * UPDATED: TOP_OFFSET:160, PLACEMENT_START_X:90, HOME_X:68
 */

/* global GW */
GW.Collision = {

  circlesOverlap(ax, ay, ar, bx, by, br) {
    const dx = ax - bx, dy = ay - by;
    return (dx * dx + dy * dy) <= (ar + br) * (ar + br);
  },

  sameLane(a, b) {
    return a.lane === b.lane;
  },

  cellOccupied(characters, lane, cellIndex) {
    return characters.some(
      ch => ch.alive && ch.lane === lane && ch.cellIndex === cellIndex
    );
  },

  /**
   * Convert lane + cellIndex to world coordinates.
   * PLACEMENT_START_X: 90, CELL_WIDTH: 80
   * Lane center Y: TOP_OFFSET + (lane - 0.5) * LANE_HEIGHT
   */
  cellToWorld(lane, cellIndex) {
    const x = GW.BOARD.PLACEMENT_START_X + cellIndex * GW.BOARD.CELL_WIDTH;
    const y = GW.BOARD.TOP_OFFSET + (lane - 0.5) * GW.BOARD.LANE_HEIGHT;
    return { x, y };
  },

  /**
   * Convert world x,y to nearest lane + cellIndex.
   * Returns null if outside the playfield.
   */
  worldToCell(worldX, worldY) {
    const lane = Math.floor(
      (worldY - GW.BOARD.TOP_OFFSET) / GW.BOARD.LANE_HEIGHT
    ) + 1;

    if (lane < 1 || lane > GW.BOARD.LANES) return null;

    const relX      = worldX - GW.BOARD.PLACEMENT_START_X;
    const cellIndex = Math.round(relX / GW.BOARD.CELL_WIDTH);

    if (cellIndex < 0 || cellIndex >= GW.BOARD.CELLS_PER_LANE) return null;

    return { lane, cellIndex };
  },

  isValidPlacementPoint(worldX, worldY) {
    const cell = GW.Collision.worldToCell(worldX, worldY);
    if (!cell) return false;
    const maxX = GW.BOARD.PLACEMENT_START_X +
                 (GW.BOARD.CELLS_PER_LANE - 1) * GW.BOARD.CELL_WIDTH;
    return worldX >= GW.BOARD.PLACEMENT_START_X && worldX <= maxX;
  },
};
