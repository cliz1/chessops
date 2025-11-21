"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.between = exports.ray = exports.attacks = exports.archerAttacks = exports.wizardAttacks = exports.rollingsnareAttacks = exports.snareAttacks = exports.royalpainterAttacks = exports.painterAttacks = exports.commonerAttacks = exports.amazonAttacks = exports.princessAttacks = exports.championAttacks = exports.queenAttacks = exports.rookAttacks = exports.bishopAttacks = exports.ANTI_DIAG_RANGE = exports.DIAG_RANGE = exports.RANK_RANGE = exports.FILE_RANGE = exports.pawnAttacks = exports.knightAttacks = exports.kingAttacks = exports.ARCHER_DELTAS = void 0;
const squareSet_js_1 = require("./squareSet.js");
const util_js_1 = require("./util.js");
const computeRange = (square, deltas) => {
    let range = squareSet_js_1.SquareSet.empty();
    for (const delta of deltas) {
        const sq = square + delta;
        if (0 <= sq && sq < 64 && Math.abs((0, util_js_1.squareFile)(square) - (0, util_js_1.squareFile)(sq)) <= 2) {
            range = range.with(sq);
        }
    }
    return range;
};
const tabulate = (f) => {
    const table = [];
    for (let square = 0; square < 64; square++)
        table[square] = f(square);
    return table;
};
const KING_ATTACKS = tabulate(sq => computeRange(sq, [-9, -8, -7, -1, 1, 7, 8, 9]));
const KNIGHT_ATTACKS = tabulate(sq => computeRange(sq, [-17, -15, -10, -6, 6, 10, 15, 17]));
const PAWN_ATTACKS = {
    white: tabulate(sq => computeRange(sq, [7, 9])),
    black: tabulate(sq => computeRange(sq, [-7, -9])),
};
// helper: single-step offsets that also avoid file-wrap issues
function singleStepTargets(sq, deltas) {
    let set = squareSet_js_1.SquareSet.empty();
    for (const d of deltas) {
        const to = sq + d;
        if (0 <= to && to < 64) {
            // ensure we didn't wrap files when applying +/-1
            const fileDelta = Math.abs((0, util_js_1.squareFile)(to) - (0, util_js_1.squareFile)(sq));
            if (fileDelta <= 1)
                set = set.with(to);
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
exports.ARCHER_DELTAS = [7, 9, -7, -9];
const ORTHOGONAL_DELTAS = [8, -8, 1, -1];
const WIZARD_ATTACKS = tabulate(sq => {
    // Start with empty
    let s = squareSet_js_1.SquareSet.empty();
    // For each orthogonal direction, add 1-step and (if legal) 2-step
    for (const d of ORTHOGONAL_DELTAS) {
        // first step(s) from sq in direction d
        const firstStepSet = singleStepTargets(sq, [d]);
        for (const first of firstStepSet) {
            s = s.with(first);
            // second step: singleStepTargets applied to first in the same direction
            const secondStepSet = singleStepTargets(first, [d]);
            for (const second of secondStepSet) {
                s = s.with(second);
            }
        }
    }
    return s;
});
const ROLLINGSNARE_ATTACKS = tabulate(sq => {
    let s = KING_ATTACKS[sq];
    s = s.union(WIZARD_ATTACKS[sq]);
    return s;
});
/**
 * Gets squares attacked or defended by a king on `square`.
 */
const kingAttacks = (square) => KING_ATTACKS[square];
exports.kingAttacks = kingAttacks;
/**
 * Gets squares attacked or defended by a knight on `square`.
 */
const knightAttacks = (square) => KNIGHT_ATTACKS[square];
exports.knightAttacks = knightAttacks;
/**
 * Gets squares attacked or defended by a pawn of the given `color`
 * on `square`.
 */
const pawnAttacks = (color, square) => PAWN_ATTACKS[color][square];
exports.pawnAttacks = pawnAttacks;
exports.FILE_RANGE = tabulate(sq => squareSet_js_1.SquareSet.fromFile((0, util_js_1.squareFile)(sq)).without(sq));
exports.RANK_RANGE = tabulate(sq => squareSet_js_1.SquareSet.fromRank((0, util_js_1.squareRank)(sq)).without(sq));
exports.DIAG_RANGE = tabulate(sq => {
    const diag = new squareSet_js_1.SquareSet(134480385, 2151686160);
    const shift = 8 * ((0, util_js_1.squareRank)(sq) - (0, util_js_1.squareFile)(sq));
    return (shift >= 0 ? diag.shl64(shift) : diag.shr64(-shift)).without(sq);
});
exports.ANTI_DIAG_RANGE = tabulate(sq => {
    const diag = new squareSet_js_1.SquareSet(270549120, 16909320);
    const shift = 8 * ((0, util_js_1.squareRank)(sq) + (0, util_js_1.squareFile)(sq) - 7);
    return (shift >= 0 ? diag.shl64(shift) : diag.shr64(-shift)).without(sq);
});
const hyperbola = (bit, range, occupied) => {
    let forward = occupied.intersect(range);
    let reverse = forward.bswap64(); // Assumes no more than 1 bit per rank
    forward = forward.minus64(bit);
    reverse = reverse.minus64(bit.bswap64());
    return forward.xor(reverse.bswap64()).intersect(range);
};
const fileAttacks = (square, occupied) => hyperbola(squareSet_js_1.SquareSet.fromSquare(square), exports.FILE_RANGE[square], occupied);
const rankAttacks = (square, occupied) => {
    const range = exports.RANK_RANGE[square];
    let forward = occupied.intersect(range);
    let reverse = forward.rbit64();
    forward = forward.minus64(squareSet_js_1.SquareSet.fromSquare(square));
    reverse = reverse.minus64(squareSet_js_1.SquareSet.fromSquare(63 - square));
    return forward.xor(reverse.rbit64()).intersect(range);
};
/**
 * Gets squares attacked or defended by a bishop on `square`, given `occupied`
 * squares.
 */
const bishopAttacks = (square, occupied) => {
    const bit = squareSet_js_1.SquareSet.fromSquare(square);
    return hyperbola(bit, exports.DIAG_RANGE[square], occupied).xor(hyperbola(bit, exports.ANTI_DIAG_RANGE[square], occupied));
};
exports.bishopAttacks = bishopAttacks;
/**
 * Gets squares attacked or defended by a rook on `square`, given `occupied`
 * squares.
 */
const rookAttacks = (square, occupied) => fileAttacks(square, occupied).xor(rankAttacks(square, occupied));
exports.rookAttacks = rookAttacks;
/**
 * Gets squares attacked or defended by a queen on `square`, given `occupied`
 * squares.
 */
const queenAttacks = (square, occupied) => (0, exports.bishopAttacks)(square, occupied).xor((0, exports.rookAttacks)(square, occupied));
exports.queenAttacks = queenAttacks;
/** Gets squares attacked or defended by a champion  */
const championAttacks = (square, occupied) => (0, exports.knightAttacks)(square).xor((0, exports.rookAttacks)(square, occupied));
exports.championAttacks = championAttacks;
/** Gets squares attacked or defended by a princess */
const princessAttacks = (square, occupied) => (0, exports.bishopAttacks)(square, occupied).xor((0, exports.knightAttacks)(square));
exports.princessAttacks = princessAttacks;
/** Gets squares attacked or defended by an amazon */
const amazonAttacks = (square, occupied) => (0, exports.queenAttacks)(square, occupied).xor((0, exports.knightAttacks)(square));
exports.amazonAttacks = amazonAttacks;
/** Gets squares attacked or defended by a commoner */
const commonerAttacks = (square) => KING_ATTACKS[square];
exports.commonerAttacks = commonerAttacks;
/** Gets squares attacked or defended by a painter */
const painterAttacks = (color, square) => PAWN_ATTACKS[color][square];
exports.painterAttacks = painterAttacks;
/** Gets squares attacked or defended by a royal painter */
const royalpainterAttacks = (square) => KING_ATTACKS[square];
exports.royalpainterAttacks = royalpainterAttacks;
/** Gets squares attacked or defended by a snare */
const snareAttacks = (color, square) => SNARE_ATTACKS[color][square];
exports.snareAttacks = snareAttacks;
/** Gets squares attacked or defended by a snare */
const rollingsnareAttacks = (square) => ROLLINGSNARE_ATTACKS[square];
exports.rollingsnareAttacks = rollingsnareAttacks;
/** Gets squares attacked or defended by a wizard */
const wizardAttacks = (square) => WIZARD_ATTACKS[square];
exports.wizardAttacks = wizardAttacks;
/** Gets squares attacked or defended by an archer on `square`. */
const archerAttacks = (square, occupied) => {
    let s = squareSet_js_1.SquareSet.empty();
    for (const d of exports.ARCHER_DELTAS) {
        // step 1: adjacent diagonal (always added)
        const first = square + d;
        if (0 <= first && first < 64 && Math.abs((0, util_js_1.squareFile)(first) - (0, util_js_1.squareFile)(square)) === 1) {
            s = s.with(first);
            if (occupied.has(first)) {
                // blocked at step 1 — nothing beyond
                continue;
            }
        }
        else {
            // can't take step 1 in this direction (offboard/wrap) => skip direction
            continue;
        }
        // steps 2..3: only add the first occupied square (if any), stop when we hit a blocker
        for (let step = 2; step <= 3; step++) {
            const to = square + d * step;
            if (!(0 <= to && to < 64))
                break;
            // ensure file didn't wrap; for a diagonal move file delta must equal step
            if (Math.abs((0, util_js_1.squareFile)(to) - (0, util_js_1.squareFile)(square)) !== step)
                break;
            if (occupied.has(to)) {
                // add the blocker (friend or enemy) — archer "attacks" it (can capture enemy)
                s = s.with(to);
                break; // can't shoot/attack past this blocker
            }
            // if empty — do not add it, but continue to potentially reach the next square
        }
    }
    return s;
};
exports.archerAttacks = archerAttacks;
/**
 * Gets squares attacked or defended by a `piece` on `square`, given
 * `occupied` squares.
 */
const attacks = (piece, square, occupied) => {
    switch (piece.role) {
        case 'pawn':
            return (0, exports.pawnAttacks)(piece.color, square);
        case 'knight':
            return (0, exports.knightAttacks)(square);
        case 'bishop':
            return (0, exports.bishopAttacks)(square, occupied);
        case 'rook':
            return (0, exports.rookAttacks)(square, occupied);
        case 'queen':
            return (0, exports.queenAttacks)(square, occupied);
        case 'king':
            return (0, exports.kingAttacks)(square);
        case 'champion':
            return (0, exports.knightAttacks)(square).xor((0, exports.rookAttacks)(square, occupied));
        case 'princess':
            return (0, exports.bishopAttacks)(square, occupied).xor((0, exports.knightAttacks)(square));
        case 'amazon':
            return (0, exports.queenAttacks)(square, occupied).xor((0, exports.knightAttacks)(square));
        case 'commoner':
            return (0, exports.commonerAttacks)(square);
        case 'painter':
            return (0, exports.painterAttacks)(piece.color, square);
        case 'snare':
            return (0, exports.snareAttacks)(piece.color, square);
        case 'wizard':
            return (0, exports.wizardAttacks)(square);
        case 'archer':
            return (0, exports.archerAttacks)(square, occupied);
        case 'royalpainter':
            return (0, exports.royalpainterAttacks)(square);
        case 'rollingsnare':
            return (0, exports.rollingsnareAttacks)(square);
    }
};
exports.attacks = attacks;
/**
 * Gets all squares of the rank, file or diagonal with the two squares
 * `a` and `b`, or an empty set if they are not aligned.
 */
const ray = (a, b) => {
    const other = squareSet_js_1.SquareSet.fromSquare(b);
    if (exports.RANK_RANGE[a].intersects(other))
        return exports.RANK_RANGE[a].with(a);
    if (exports.ANTI_DIAG_RANGE[a].intersects(other))
        return exports.ANTI_DIAG_RANGE[a].with(a);
    if (exports.DIAG_RANGE[a].intersects(other))
        return exports.DIAG_RANGE[a].with(a);
    if (exports.FILE_RANGE[a].intersects(other))
        return exports.FILE_RANGE[a].with(a);
    return squareSet_js_1.SquareSet.empty();
};
exports.ray = ray;
/**
 * Gets all squares between `a` and `b` (bounds not included), or an empty set
 * if they are not on the same rank, file or diagonal.
 */
const between = (a, b) => (0, exports.ray)(a, b)
    .intersect(squareSet_js_1.SquareSet.full().shl64(a).xor(squareSet_js_1.SquareSet.full().shl64(b)))
    .withoutFirst();
exports.between = between;
//# sourceMappingURL=attacks.js.map