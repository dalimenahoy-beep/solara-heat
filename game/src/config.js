// Solara Bay's shared map numbers. The city builder, the traffic, the police, the mission
// director and the minimap all read this one grid, so every system agrees about where the
// streets run and where the named places stand.

/** Metres between two neighbouring intersections: a 62 m block face plus a 14 m street. */
export const PITCH = 76;

/** Centre lines of the seven avenues on each axis, west/north to east/south. */
export const AXES = [-228, -152, -76, 0, 76, 152, 228];

/** Half the street width: asphalt reaches this far either side of a centre line. */
export const ROAD_HALF = 7;

/** Buildings keep this much distance from a centre line; the apron fills the gap. */
export const BLOCK_EDGE = 10;

/** How far a lane sits from its avenue's centre line. Traffic keeps right. */
export const LANE = 3.6;

/** The built-up city ends this far from the middle in every direction. */
export const CITY_EDGE = 266;

/** East of this x the sand gives up and the sea takes over. */
export const SHORE_X = 292;

/** Places with names, in world metres: where missions send Marco and signs point. */
export const PLACES = {
  garage: { x: -196, z: 196, name: "Lupe's Garage" },
  beachLot: { x: 238, z: -84, name: 'Palmera Beach Lot' },
  marina: { x: 252, z: 84, name: 'Marina del Sol' },
  casino: { x: -84, z: -238, name: 'Casino Azul' },
  bank: { x: 160, z: 84, name: 'Banco Solara' },
  airport: { x: 40, z: 252, name: 'Solara Airstrip' },
  hospital: { x: -238, z: -160, name: 'St. Palmera Hospital' },
  precinct: { x: 84, z: -160, name: 'SBPD Precinct' },
  start: { x: -196, z: 168, name: 'Palm Court Motel' },
};

/** The simulation's fixed step, in seconds; the render loop feeds time in these bites. */
export const STEP = 1 / 60;
