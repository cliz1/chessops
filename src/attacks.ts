/**
 * Compute attacks and rays.
 *
 * These are low-level functions that can be used to implement chess rules.
 *
 * Implementation notes: Sliding attacks are computed using
 * [Hyperbola Quintessence](https://www.chessprogramming.org/Hyperbola_Quintessence).
 * Magic Bitboards would deliver slightly faster lookups, but also require
 * initializing considerably larger attack tables. On the web, initialization
 * time is important, so the chosen method may strike a better balance.
 *
 * @packageDocumentation
 */

import { SquareSet } from './squareSet.js';
import { BySquare, Color, Piece, Square } from './types.js';
import { squareFile, squareRank } from './util.js';

const computeRange = (square: Square, deltas: number[]): SquareSet => {
  let range = SquareSet.empty();
  for (const delta of deltas) {
    const sq = square + delta;
    if (0 <= sq && sq < 64 && Math.abs(squareFile(square) - squareFile(sq)) <= 2) {
      range = range.with(sq);
    }
  }
  return range;
};

const tabulate = <T>(f: (square: Square) => T): BySquare<T> => {
  const table = [];
  for (let square = 0; square < 64; square++) table[square] = f(square);
  return table;
};

const KING_ATTACKS = tabulate(sq => computeRange(sq, [-9, -8, -7, -1, 1, 7, 8, 9]));
const KNIGHT_ATTACKS = tabulate(sq => computeRange(sq, [-17, -15, -10, -6, 6, 10, 15, 17]));
const PAWN_ATTACKS = {
  white: tabulate(sq => computeRange(sq, [7, 9])),
  black: tabulate(sq => computeRange(sq, [-7, -9])),
};

// helper: single-step offsets that also avoid file-wrap issues
function singleStepTargets(sq: Square, deltas: number[]): SquareSet {
  let set = SquareSet.empty();
  for (const d of deltas) {
    const to = sq + d;
    if (0 <= to && to < 64) {
      // ensure we didn't wrap files when applying +/-1
      const fileDelta = Math.abs(squareFile(to) - squareFile(sq));
      if (fileDelta <= 1) set = set.with(to);
    }
  }
  return set;
}

const SNARE_ATTACKS = {
  // white snare "forward" is +8; left/right are +7 and +9 (single step).
  white: tabulate(sq => singleStepTargets(sq, [8, 7, 9])),
  // black snare "forward" is -8; left/right -7 and -9.
  black: tabulate(sq => singleStepTargets(sq, [-8, -9, -7])),
};


/**
 * Gets squares attacked or defended by a king on `square`.
 */
export const kingAttacks = (square: Square): SquareSet => KING_ATTACKS[square];

/**
 * Gets squares attacked or defended by a knight on `square`.
 */
export const knightAttacks = (square: Square): SquareSet => KNIGHT_ATTACKS[square];

/**
 * Gets squares attacked or defended by a pawn of the given `color`
 * on `square`.
 */
export const pawnAttacks = (color: Color, square: Square): SquareSet => PAWN_ATTACKS[color][square];

const FILE_RANGE = tabulate(sq => SquareSet.fromFile(squareFile(sq)).without(sq));
const RANK_RANGE = tabulate(sq => SquareSet.fromRank(squareRank(sq)).without(sq));

const DIAG_RANGE = tabulate(sq => {
  const diag = new SquareSet(0x0804_0201, 0x8040_2010);
  const shift = 8 * (squareRank(sq) - squareFile(sq));
  return (shift >= 0 ? diag.shl64(shift) : diag.shr64(-shift)).without(sq);
});

const ANTI_DIAG_RANGE = tabulate(sq => {
  const diag = new SquareSet(0x1020_4080, 0x0102_0408);
  const shift = 8 * (squareRank(sq) + squareFile(sq) - 7);
  return (shift >= 0 ? diag.shl64(shift) : diag.shr64(-shift)).without(sq);
});

const hyperbola = (bit: SquareSet, range: SquareSet, occupied: SquareSet): SquareSet => {
  let forward = occupied.intersect(range);
  let reverse = forward.bswap64(); // Assumes no more than 1 bit per rank
  forward = forward.minus64(bit);
  reverse = reverse.minus64(bit.bswap64());
  return forward.xor(reverse.bswap64()).intersect(range);
};

const fileAttacks = (square: Square, occupied: SquareSet): SquareSet =>
  hyperbola(SquareSet.fromSquare(square), FILE_RANGE[square], occupied);

const rankAttacks = (square: Square, occupied: SquareSet): SquareSet => {
  const range = RANK_RANGE[square];
  let forward = occupied.intersect(range);
  let reverse = forward.rbit64();
  forward = forward.minus64(SquareSet.fromSquare(square));
  reverse = reverse.minus64(SquareSet.fromSquare(63 - square));
  return forward.xor(reverse.rbit64()).intersect(range);
};

/**
 * Gets squares attacked or defended by a bishop on `square`, given `occupied`
 * squares.
 */
export const bishopAttacks = (square: Square, occupied: SquareSet): SquareSet => {
  const bit = SquareSet.fromSquare(square);
  return hyperbola(bit, DIAG_RANGE[square], occupied).xor(hyperbola(bit, ANTI_DIAG_RANGE[square], occupied));
};

/**
 * Gets squares attacked or defended by a rook on `square`, given `occupied`
 * squares.
 */
export const rookAttacks = (square: Square, occupied: SquareSet): SquareSet =>
  fileAttacks(square, occupied).xor(rankAttacks(square, occupied));

/**
 * Gets squares attacked or defended by a queen on `square`, given `occupied`
 * squares.
 */
export const queenAttacks = (square: Square, occupied: SquareSet): SquareSet =>
  bishopAttacks(square, occupied).xor(rookAttacks(square, occupied));

/** Gets squares attacked or defended by a knook  */
export const knookAttacks = (square: Square, occupied: SquareSet): SquareSet =>
  knightAttacks(square).xor(rookAttacks(square, occupied));

/** Gets squares attacked or defended by a knishop */
export const knishopAttacks = (square: Square, occupied: SquareSet): SquareSet =>
  bishopAttacks(square, occupied).xor(knightAttacks(square));

/** Gets squares attacked or defended by an amazon */
export const amazonAttacks = (square: Square, occupied: SquareSet): SquareSet =>
  queenAttacks(square, occupied).xor(knightAttacks(square));

/** Gets squares attacked or defended by a peasant */
export const peasantAttacks = (square: Square): SquareSet => KING_ATTACKS[square];

/** Gets squares attacked or defended by a painter */
export const painterAttacks = (color: Color, square: Square): SquareSet => PAWN_ATTACKS[color][square];

/** Gets squares attacked or defended by a snare */
export const snareAttacks = (color: Color, square: Square): SquareSet => SNARE_ATTACKS[color][square];

/**
 * Gets squares attacked or defended by a `piece` on `square`, given
 * `occupied` squares.
 */
export const attacks = (piece: Piece, square: Square, occupied: SquareSet): SquareSet => {
  switch (piece.role) {
    case 'pawn':
      return pawnAttacks(piece.color, square);
    case 'knight':
      return knightAttacks(square);
    case 'bishop':
      return bishopAttacks(square, occupied);
    case 'rook':
      return rookAttacks(square, occupied);
    case 'queen':
      return queenAttacks(square, occupied);
    case 'king':
      return kingAttacks(square);
    case 'knook':
      return knightAttacks(square).xor(rookAttacks(square, occupied));
    case 'knishop':
      return bishopAttacks(square, occupied).xor(knightAttacks(square));
    case 'amazon':
      return queenAttacks(square, occupied).xor(knightAttacks(square));
    case 'peasant':
      return peasantAttacks(square);
    case 'painter':
      return painterAttacks(piece.color, square);
    case 'snare':
      return snareAttacks(piece.color, square);
  }
};

/**
 * Gets all squares of the rank, file or diagonal with the two squares
 * `a` and `b`, or an empty set if they are not aligned.
 */
export const ray = (a: Square, b: Square): SquareSet => {
  const other = SquareSet.fromSquare(b);
  if (RANK_RANGE[a].intersects(other)) return RANK_RANGE[a].with(a);
  if (ANTI_DIAG_RANGE[a].intersects(other)) return ANTI_DIAG_RANGE[a].with(a);
  if (DIAG_RANGE[a].intersects(other)) return DIAG_RANGE[a].with(a);
  if (FILE_RANGE[a].intersects(other)) return FILE_RANGE[a].with(a);
  return SquareSet.empty();
};

/**
 * Gets all squares between `a` and `b` (bounds not included), or an empty set
 * if they are not on the same rank, file or diagonal.
 */
export const between = (a: Square, b: Square): SquareSet =>
  ray(a, b)
    .intersect(SquareSet.full().shl64(a).xor(SquareSet.full().shl64(b)))
    .withoutFirst();
