"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isImpossibleCheck = exports.isStandardMaterial = exports.isStandardMaterialSide = exports.normalizeMove = exports.castlingSide = exports.equalsIgnoreMoves = exports.pseudoDests = exports.Chess = exports.Position = exports.Castles = exports.PositionError = exports.IllegalSetup = void 0;
const result_1 = require("@badrap/result");
const attacks_js_1 = require("./attacks.js");
const attacks_js_2 = require("./attacks.js");
const board_js_1 = require("./board.js");
const squareSet_js_1 = require("./squareSet.js");
const types_js_1 = require("./types.js");
const util_js_1 = require("./util.js");
var IllegalSetup;
(function (IllegalSetup) {
    IllegalSetup["Empty"] = "ERR_EMPTY";
    IllegalSetup["OppositeCheck"] = "ERR_OPPOSITE_CHECK";
    IllegalSetup["PawnsOnBackrank"] = "ERR_PAWNS_ON_BACKRANK";
    IllegalSetup["Kings"] = "ERR_KINGS";
    IllegalSetup["Variant"] = "ERR_VARIANT";
})(IllegalSetup || (exports.IllegalSetup = IllegalSetup = {}));
class PositionError extends Error {
}
exports.PositionError = PositionError;
const attacksTo = (square, attacker, board, occupied) => board[attacker].intersect((0, attacks_js_1.rookAttacks)(square, occupied)
    .intersect(board.rooksAndQueens())
    .union((0, attacks_js_1.bishopAttacks)(square, occupied).intersect(board.bishopsAndQueens()))
    .union((0, attacks_js_1.knightAttacks)(square).intersect(board.knight))
    .union((0, attacks_js_1.kingAttacks)(square).intersect(board.king))
    .union((0, attacks_js_1.pawnAttacks)((0, util_js_1.opposite)(attacker), square).intersect(board.pawn))
    .union((0, attacks_js_1.championAttacks)(square, occupied).intersect(board.champion))
    .union((0, attacks_js_1.princessAttacks)(square, occupied).intersect(board.princess))
    .union((0, attacks_js_1.amazonAttacks)(square, occupied).intersect(board.amazon))
    .union((0, attacks_js_1.mannAttacks)(square).intersect(board.mann))
    .union((0, attacks_js_1.painterAttacks)((0, util_js_1.opposite)(attacker), square).intersect(board.painter))
    .union((0, attacks_js_1.wizardAttacks)(square).intersect(board.wizard))
    .union((0, attacks_js_1.archerAttacks)(square, occupied).intersect(board.archer))
    .union((0, attacks_js_1.royalpainterAttacks)(square, occupied).intersect(board.royalpainter)));
class Castles {
    constructor() { }
    static default() {
        const castles = new Castles();
        castles.castlingRights = squareSet_js_1.SquareSet.corners();
        castles.rook = {
            white: { a: 0, h: 7 },
            black: { a: 56, h: 63 },
        };
        castles.path = {
            white: { a: new squareSet_js_1.SquareSet(0xe, 0), h: new squareSet_js_1.SquareSet(0x60, 0) },
            black: { a: new squareSet_js_1.SquareSet(0, 0x0e000000), h: new squareSet_js_1.SquareSet(0, 0x60000000) },
        };
        return castles;
    }
    static empty() {
        const castles = new Castles();
        castles.castlingRights = squareSet_js_1.SquareSet.empty();
        castles.rook = {
            white: { a: undefined, h: undefined },
            black: { a: undefined, h: undefined },
        };
        castles.path = {
            white: { a: squareSet_js_1.SquareSet.empty(), h: squareSet_js_1.SquareSet.empty() },
            black: { a: squareSet_js_1.SquareSet.empty(), h: squareSet_js_1.SquareSet.empty() },
        };
        return castles;
    }
    clone() {
        const castles = new Castles();
        castles.castlingRights = this.castlingRights;
        castles.rook = {
            white: { a: this.rook.white.a, h: this.rook.white.h },
            black: { a: this.rook.black.a, h: this.rook.black.h },
        };
        castles.path = {
            white: { a: this.path.white.a, h: this.path.white.h },
            black: { a: this.path.black.a, h: this.path.black.h },
        };
        return castles;
    }
    add(color, side, king, rook) {
        const kingTo = (0, util_js_1.kingCastlesTo)(color, side);
        const rookTo = (0, util_js_1.rookCastlesTo)(color, side);
        this.castlingRights = this.castlingRights.with(rook);
        this.rook[color][side] = rook;
        this.path[color][side] = (0, attacks_js_1.between)(rook, rookTo)
            .with(rookTo)
            .union((0, attacks_js_1.between)(king, kingTo).with(kingTo))
            .without(king)
            .without(rook);
    }
    static fromSetup(setup) {
        const castles = Castles.empty();
        const castlers = setup.castlingRights.intersect(setup.board.rook.union(setup.board.champion));
        for (const color of types_js_1.COLORS) {
            const backrank = squareSet_js_1.SquareSet.backrank(color);
            const king = setup.board.kingOf(color);
            if (!(0, util_js_1.defined)(king) || !backrank.has(king))
                continue;
            const side = castlers.intersect(setup.board[color]).intersect(backrank);
            const aSide = side.first();
            if ((0, util_js_1.defined)(aSide) && aSide < king)
                castles.add(color, 'a', king, aSide);
            const hSide = side.last();
            if ((0, util_js_1.defined)(hSide) && king < hSide)
                castles.add(color, 'h', king, hSide);
        }
        return castles;
    }
    discardRook(square) {
        if (this.castlingRights.has(square)) {
            this.castlingRights = this.castlingRights.without(square);
            for (const color of types_js_1.COLORS) {
                for (const side of types_js_1.CASTLING_SIDES) {
                    if (this.rook[color][side] === square)
                        this.rook[color][side] = undefined;
                }
            }
        }
    }
    discardColor(color) {
        this.castlingRights = this.castlingRights.diff(squareSet_js_1.SquareSet.backrank(color));
        this.rook[color].a = undefined;
        this.rook[color].h = undefined;
    }
}
exports.Castles = Castles;
class Position {
    constructor(rules) {
        this.rules = rules;
    }
    reset() {
        this.board = board_js_1.Board.default();
        this.pockets = undefined;
        this.turn = 'white';
        this.castles = Castles.default();
        this.epSquare = undefined;
        this.remainingChecks = undefined;
        this.halfmoves = 0;
        this.fullmoves = 1;
    }
    setupUnchecked(setup) {
        this.board = setup.board.clone();
        this.board.promoted = squareSet_js_1.SquareSet.empty();
        this.pockets = undefined;
        this.turn = setup.turn;
        this.castles = Castles.fromSetup(setup);
        this.epSquare = validEpSquare(this, setup.epSquare);
        this.remainingChecks = undefined;
        this.halfmoves = setup.halfmoves;
        this.fullmoves = setup.fullmoves;
    }
    // When subclassing overwrite at least:
    //
    // - static default()
    // - static fromSetup()
    // - static clone()
    //
    // - dests()
    // - isVariantEnd()
    // - variantOutcome()
    // - hasInsufficientMaterial()
    // - isStandardMaterial()
    kingAttackers(square, attacker, occupied) {
        return attacksTo(square, attacker, this.board, occupied);
    }
    playCaptureAt(square, captured) {
        this.halfmoves = 0;
        if (captured.role === 'rook')
            this.castles.discardRook(square);
        if (this.pockets)
            this.pockets[(0, util_js_1.opposite)(captured.color)][captured.promoted ? 'pawn' : captured.role]++;
    }
    ctx() {
        const variantEnd = this.isVariantEnd();
        const king = this.board.kingOf(this.turn);
        if (!(0, util_js_1.defined)(king)) {
            return { king, blockers: squareSet_js_1.SquareSet.empty(), checkers: squareSet_js_1.SquareSet.empty(), variantEnd, mustCapture: false };
        }
        const rookLikeSliders = this.board.rooksAndQueens()
            .union(this.board.champion)
            .union(this.board.amazon)
            .union(this.board.royalpainter);
        const bishopLikeSliders = this.board.bishopsAndQueens()
            .union(this.board.princess)
            .union(this.board.amazon)
            .union(this.board.royalpainter);
        const occ = this.board.occupied;
        // build the set of ray-squares from the king (ignoring occupancy)
        const rookLines = attacks_js_2.FILE_RANGE[king].union(attacks_js_2.RANK_RANGE[king]);
        const bishopLines = attacks_js_2.DIAG_RANGE[king].union(attacks_js_2.ANTI_DIAG_RANGE[king]);
        // candidate slider snipers ignoring occupancy
        const sliderSnipers = rookLikeSliders
            .intersect(rookLines)
            .union(bishopLikeSliders.intersect(bishopLines))
            .intersect(this.board[(0, util_js_1.opposite)(this.turn)]);
        let archerSnipers = squareSet_js_1.SquareSet.empty();
        for (const d of attacks_js_2.ARCHER_DELTAS) {
            for (let step = 2; step <= 3; step++) {
                const sq = king + d * step;
                // bounds check and file-wrap check
                if (!(0 <= sq && sq < 64))
                    continue;
                if (Math.abs((0, util_js_1.squareFile)(sq) - (0, util_js_1.squareFile)(king)) !== step)
                    continue;
                // only keep if there's an opponent archer on that square
                if (this.board[(0, util_js_1.opposite)(this.turn)].has(sq) && this.board.archer.has(sq)) {
                    archerSnipers = archerSnipers.with(sq);
                }
            }
        }
        const snipers = sliderSnipers.union(archerSnipers);
        let blockers = squareSet_js_1.SquareSet.empty();
        for (const sniper of snipers) {
            const b = (0, attacks_js_1.between)(king, sniper).intersect(this.board.occupied);
            if (!b.moreThanOne())
                blockers = blockers.union(b);
        }
        const checkers = this.kingAttackers(king, (0, util_js_1.opposite)(this.turn), this.board.occupied);
        return { king, blockers, checkers, variantEnd, mustCapture: false };
    }
    clone() {
        var _a, _b;
        const pos = new this.constructor();
        pos.board = this.board.clone();
        pos.pockets = (_a = this.pockets) === null || _a === void 0 ? void 0 : _a.clone();
        pos.turn = this.turn;
        pos.castles = this.castles.clone();
        pos.epSquare = this.epSquare;
        pos.remainingChecks = (_b = this.remainingChecks) === null || _b === void 0 ? void 0 : _b.clone();
        pos.halfmoves = this.halfmoves;
        pos.fullmoves = this.fullmoves;
        return pos;
    }
    validate() {
        if (this.board.occupied.isEmpty())
            return result_1.Result.err(new PositionError(IllegalSetup.Empty));
        if (this.board.king.size() !== 2)
            return result_1.Result.err(new PositionError(IllegalSetup.Kings));
        if (!(0, util_js_1.defined)(this.board.kingOf(this.turn)))
            return result_1.Result.err(new PositionError(IllegalSetup.Kings));
        const otherKing = this.board.kingOf((0, util_js_1.opposite)(this.turn));
        if (!(0, util_js_1.defined)(otherKing))
            return result_1.Result.err(new PositionError(IllegalSetup.Kings));
        if (this.kingAttackers(otherKing, this.turn, this.board.occupied).nonEmpty()) {
            return result_1.Result.err(new PositionError(IllegalSetup.OppositeCheck));
        }
        if (squareSet_js_1.SquareSet.backranks().intersects(this.board.pawn)) {
            return result_1.Result.err(new PositionError(IllegalSetup.PawnsOnBackrank));
        }
        return result_1.Result.ok(undefined);
    }
    dropDests(_ctx) {
        return squareSet_js_1.SquareSet.empty();
    }
    dests(square, ctx) {
        ctx = ctx || this.ctx();
        if (ctx.variantEnd)
            return squareSet_js_1.SquareSet.empty();
        const piece = this.board.get(square);
        if (!piece || piece.color !== this.turn)
            return squareSet_js_1.SquareSet.empty();
        // --- Snaring restriction ---
        let allSnareZones = squareSet_js_1.SquareSet.empty();
        for (const [sq, bPiece] of this.board) {
            if (bPiece.role === 'snare' || bPiece.role === 'rollingsnare') {
                const zone = bPiece.role === 'snare'
                    ? snareZone(this, sq, bPiece.color)
                    : rollingSnareZone(this, sq, bPiece.color);
                for (const z of zone) {
                    const target = this.board.get(z);
                    if ((0, util_js_1.defined)(target) && target.color !== bPiece.color) {
                        allSnareZones = allSnareZones.with(z);
                    }
                }
            }
        }
        if (allSnareZones.has(square)) {
            return squareSet_js_1.SquareSet.empty();
        }
        let pseudo;
        let legal;
        if (piece.role === 'pawn' || piece.role === 'painter') {
            pseudo = (0, attacks_js_1.pawnAttacks)(this.turn, square).intersect(this.board[(0, util_js_1.opposite)(this.turn)]);
            const delta = this.turn === 'white' ? 8 : -8;
            const step = square + delta;
            if (0 <= step && step < 64 && !this.board.occupied.has(step)) {
                pseudo = pseudo.with(step);
                const canDoubleStep = this.turn === 'white' ? square < 16 : square >= 48;
                const doubleStep = step + delta;
                if (canDoubleStep && !this.board.occupied.has(doubleStep)) {
                    pseudo = pseudo.with(doubleStep);
                }
            }
            if ((0, util_js_1.defined)(this.epSquare) && canCaptureEp(this, square, ctx)) {
                legal = squareSet_js_1.SquareSet.fromSquare(this.epSquare);
            }
        }
        else if (piece.role === 'bishop')
            pseudo = (0, attacks_js_1.bishopAttacks)(square, this.board.occupied);
        else if (piece.role === 'knight')
            pseudo = (0, attacks_js_1.knightAttacks)(square);
        else if (piece.role === 'rook')
            pseudo = (0, attacks_js_1.rookAttacks)(square, this.board.occupied);
        else if (piece.role === 'queen')
            pseudo = (0, attacks_js_1.queenAttacks)(square, this.board.occupied);
        else if (piece.role === 'champion')
            pseudo = (0, attacks_js_1.knightAttacks)(square).xor((0, attacks_js_1.rookAttacks)(square, this.board.occupied));
        else if (piece.role === 'princess')
            pseudo = (0, attacks_js_1.bishopAttacks)(square, this.board.occupied).xor((0, attacks_js_1.knightAttacks)(square));
        else if (piece.role === 'amazon')
            pseudo = (0, attacks_js_1.queenAttacks)(square, this.board.occupied).xor((0, attacks_js_1.knightAttacks)(square));
        else if (piece.role === 'mann')
            pseudo = (0, attacks_js_1.mannAttacks)(square);
        else if (piece.role === 'royalpainter')
            pseudo = (0, attacks_js_1.royalpainterAttacks)(square, this.board.occupied);
        else if (piece.role === 'snare') {
            pseudo = (0, attacks_js_1.snareAttacks)(piece.color, square);
            // Snare cannot capture
            pseudo = pseudo.diff(this.board.white).diff(this.board.black);
        }
        else if (piece.role === 'rollingsnare') {
            pseudo = (0, attacks_js_1.rollingsnareAttacks)(square);
            // cannot capture
            pseudo = pseudo.diff(this.board.white).diff(this.board.black);
        }
        else if (piece.role === 'wizard') {
            pseudo = (0, attacks_js_1.wizardAttacks)(square);
        }
        else if (piece.role == 'archer') {
            pseudo = (0, attacks_js_1.archerAttacks)(square, this.board.occupied);
        }
        else
            pseudo = (0, attacks_js_1.kingAttacks)(square);
        if (piece.role !== 'wizard') {
            pseudo = pseudo.diff(this.board[this.turn]);
        }
        if ((0, util_js_1.defined)(ctx.king)) {
            if (piece.role === 'king') {
                const occ = this.board.occupied.without(square);
                for (const to of pseudo) {
                    if (this.kingAttackers(to, (0, util_js_1.opposite)(this.turn), occ).nonEmpty())
                        pseudo = pseudo.without(to);
                }
                return pseudo.union(castlingDest(this, 'a', ctx)).union(castlingDest(this, 'h', ctx));
            }
            // In check
            if (ctx.checkers.nonEmpty()) {
                if (piece.role === 'wizard') {
                    // allow wizard destinations that after simulation leave king safe
                    let allowed = squareSet_js_1.SquareSet.empty();
                    for (const to of pseudo) {
                        if (this.simulateWizardMoveIsLegal(square, to, ctx))
                            allowed = allowed.with(to);
                    }
                    pseudo = allowed;
                }
                else {
                    const checker = ctx.checkers.singleSquare();
                    if (!(0, util_js_1.defined)(checker))
                        return squareSet_js_1.SquareSet.empty();
                    // If the checking piece is a sliding/sniper type then blocking is allowed.
                    // Otherwise (leaper like knight/wizard/mann etc.) only captures of the checker
                    // are legal (i.e. you cannot "block" a leaper).
                    const checkerPiece = this.board.get(checker);
                    if (!(0, util_js_1.defined)(checkerPiece))
                        return squareSet_js_1.SquareSet.empty();
                    const role = checkerPiece.role;
                    const canBeBlocked = (role === 'rook' ||
                        role === 'queen' ||
                        role === 'bishop' ||
                        role === 'champion' || // contains rook-like sliding part
                        role === 'princess' || // contains bishop-like sliding part
                        role === 'amazon' || // queen-like sliding part
                        role === 'royalpainter' || // treated as sliding elsewhere
                        role === 'archer' // archer acted as a sniper in ctx()
                    );
                    if (canBeBlocked) {
                        pseudo = pseudo.intersect((0, attacks_js_1.between)(checker, ctx.king).with(checker));
                    }
                    else {
                        // leaper / non-blockable: only allow moves that capture the checker
                        pseudo = pseudo.intersect(squareSet_js_1.SquareSet.fromSquare(checker));
                    }
                }
            }
            // Pinned
            if (ctx.blockers.has(square)) {
                if (piece.role === 'painter') {
                    // painter pin exception logic
                    let captureSquares = this.board[(0, util_js_1.opposite)(this.turn)];
                    if ((0, util_js_1.defined)(this.epSquare) && canCaptureEp(this, square, ctx)) {
                        captureSquares = captureSquares.with(this.epSquare);
                    }
                    const capturesOnly = pseudo.intersect(captureSquares);
                    const nonCapture = pseudo.diff(captureSquares).intersect((0, attacks_js_1.ray)(square, ctx.king));
                    pseudo = capturesOnly.union(nonCapture);
                }
                else if (piece.role === 'wizard') {
                    // wizard pin exception logic
                    let allowed = squareSet_js_1.SquareSet.empty();
                    for (const to of pseudo) {
                        if (this.simulateWizardMoveIsLegal(square, to, ctx))
                            allowed = allowed.with(to);
                    }
                    pseudo = allowed;
                }
                else {
                    pseudo = pseudo.intersect((0, attacks_js_1.ray)(square, ctx.king));
                }
            }
            if (piece.role === 'wizard' && (0, util_js_1.defined)(ctx.king)) {
                let allowed = squareSet_js_1.SquareSet.empty();
                for (const to of pseudo) {
                    // simulateWizardMoveIsLegal must simulate the swap and re-evaluate king safety
                    if (this.simulateWizardMoveIsLegal(square, to, ctx))
                        allowed = allowed.with(to);
                }
                pseudo = allowed;
            }
        }
        if (legal)
            pseudo = pseudo.union(legal);
        return pseudo;
    }
    isVariantEnd() {
        return false;
    }
    variantOutcome(_ctx) {
        return;
    }
    hasInsufficientMaterial(color) {
        const side = this.board[color];
        const opp = this.board[(0, util_js_1.opposite)(color)];
        // shorthand sets on the board
        const pawns = this.board.pawn;
        const rooksQueens = this.board.rooksAndQueens();
        const painter = this.board.painter;
        const knights = this.board.knight;
        const bishopsSet = this.board.bishop;
        const canMate = this.board.champion
            .union(this.board.princess)
            .union(this.board.amazon)
            .union(this.board.mann)
            .union(this.board.royalpainter)
            .union(this.board.wizard);
        const nonMating = this.board.snare.union(this.board.archer).union(this.board.rollingsnare);
        // 1) If side has pawns, rooks/queens, painter (promotion-like), or any can-mate piece => sufficient
        if (side.intersect(pawns.union(rooksQueens).union(painter).union(canMate)).nonEmpty()) {
            return false;
        }
        // 2) Only king? => insufficient
        if (side.diff(this.board.king).isEmpty())
            return true;
        // 3) If side's only non-king pieces are non-mating pieces and opponent only has king => insufficient
        if (side.diff(this.board.king).diff(nonMating).isEmpty() && opp.diff(this.board.king).isEmpty()) {
            return true;
        }
        // 4) Knights-only cases: (side has knights and nothing else but king) vs lone king => insufficient
        if (side.intersect(knights).nonEmpty() &&
            side.diff(this.board.king).diff(knights).isEmpty() &&
            opp.diff(this.board.king).isEmpty()) {
            return true;
        }
        // 5) Bishops-only: check bishops belonging to side (use side.intersect on the board's bishop set)
        const sideBishops = side.intersect(bishopsSet);
        if (sideBishops.nonEmpty() &&
            side.diff(this.board.king).diff(bishopsSet).isEmpty() &&
            opp.diff(this.board.king).isEmpty()) {
            const bishopsOnDark = sideBishops.intersects(squareSet_js_1.SquareSet.darkSquares());
            const bishopsOnLight = sideBishops.intersects(squareSet_js_1.SquareSet.lightSquares());
            const sameSquareColor = !(bishopsOnDark && bishopsOnLight); // true if bishops are NOT on both colors
            if (sameSquareColor)
                return true;
        }
        // otherwise sufficient material
        return false;
    }
    // The following should be identical in all subclasses
    toSetup() {
        var _a, _b;
        return {
            board: this.board.clone(),
            pockets: (_a = this.pockets) === null || _a === void 0 ? void 0 : _a.clone(),
            turn: this.turn,
            castlingRights: this.castles.castlingRights,
            epSquare: legalEpSquare(this),
            remainingChecks: (_b = this.remainingChecks) === null || _b === void 0 ? void 0 : _b.clone(),
            halfmoves: Math.min(this.halfmoves, 150),
            fullmoves: Math.min(Math.max(this.fullmoves, 1), 9999),
        };
    }
    isInsufficientMaterial() {
        return types_js_1.COLORS.every(color => this.hasInsufficientMaterial(color));
    }
    hasDests(ctx) {
        ctx = ctx || this.ctx();
        for (const square of this.board[this.turn]) {
            if (this.dests(square, ctx).nonEmpty())
                return true;
        }
        return this.dropDests(ctx).nonEmpty();
    }
    isLegal(move, ctx) {
        if ((0, types_js_1.isDrop)(move)) {
            if (!this.pockets || this.pockets[this.turn][move.role] <= 0)
                return false;
            if ((move.role === 'pawn') && squareSet_js_1.SquareSet.backranks().has(move.to))
                return false;
            return this.dropDests(ctx).has(move.to);
        }
        else {
            // invalid promotion hints
            if (move.promotion === 'pawn')
                return false;
            if (move.promotion === 'king' && this.rules !== 'antichess')
                return false;
            // Helper info about the from/to squares and board pieces
            const targetPiece = this.board.get(move.to); // Piece | undefined
            const fromIsPawnLike = this.board.pawn.has(move.from) || (this.board.painter && this.board.painter.has(move.from)) || (this.board.snare && this.board.snare.has(move.from));
            const fromIsWizard = this.board.wizard && this.board.wizard.has(move.from);
            let willRequirePromotion = false;
            if (fromIsPawnLike) {
                // a pawn/painter/snare moving to the backrank => promotion required
                willRequirePromotion = squareSet_js_1.SquareSet.backranks().has(move.to);
            }
            else if (fromIsWizard && targetPiece && targetPiece.role === 'pawn' && targetPiece.color === this.turn) {
                willRequirePromotion = squareSet_js_1.SquareSet.backranks().has(move.from);
            }
            else {
                willRequirePromotion = false;
            }
            if (!!move.promotion !== willRequirePromotion)
                return false;
            const dests = this.dests(move.from, ctx);
            return dests.has(move.to) || dests.has((0, exports.normalizeMove)(this, move).to);
        }
    }
    isCheck() {
        const king = this.board.kingOf(this.turn);
        return (0, util_js_1.defined)(king) && this.kingAttackers(king, (0, util_js_1.opposite)(this.turn), this.board.occupied).nonEmpty();
    }
    isEnd(ctx) {
        if (ctx ? ctx.variantEnd : this.isVariantEnd())
            return true;
        return this.isInsufficientMaterial() || !this.hasDests(ctx);
    }
    isCheckmate(ctx) {
        ctx = ctx || this.ctx();
        return !ctx.variantEnd && ctx.checkers.nonEmpty() && !this.hasDests(ctx);
    }
    isStalemate(ctx) {
        ctx = ctx || this.ctx();
        return !ctx.variantEnd && ctx.checkers.isEmpty() && !this.hasDests(ctx);
    }
    outcome(ctx) {
        const variantOutcome = this.variantOutcome(ctx);
        if (variantOutcome)
            return variantOutcome;
        ctx = ctx || this.ctx();
        if (this.isCheckmate(ctx))
            return { winner: (0, util_js_1.opposite)(this.turn) };
        else if (this.isInsufficientMaterial() || this.isStalemate(ctx))
            return { winner: undefined };
        else
            return;
    }
    allDests(ctx) {
        ctx = ctx || this.ctx();
        const d = new Map();
        if (ctx.variantEnd)
            return d;
        for (const square of this.board[this.turn]) {
            d.set(square, this.dests(square, ctx));
        }
        return d;
    }
    play(move) {
        const turn = this.turn;
        const prevEp = this.epSquare;
        const castling = (0, exports.castlingSide)(this, move);
        // Clear ephemeral state for this turn; will be set again if a double-step occurs
        this.epSquare = undefined;
        // Move clocks and turn flip (preserve original ordering)
        this.halfmoves += 1;
        if (turn === 'black')
            this.fullmoves += 1;
        this.turn = (0, util_js_1.opposite)(turn);
        if ((0, types_js_1.isDrop)(move)) {
            // dropping a piece from pocket
            this.board.set(move.to, { role: move.role, color: turn });
            if (this.pockets)
                this.pockets[turn][move.role]--;
            if (move.role === 'pawn')
                this.halfmoves = 0;
            return;
        }
        // Non-drop move
        const piece = this.board.take(move.from);
        if (!piece)
            return;
        // epCapture holds a piece already removed by en-passant (pawn capturing)
        let epCapture;
        // --- Pawn behavior (including normal EP capture when move.to === prevEp) ---
        if (piece.role === 'pawn') {
            // reset fifty-move clock
            this.halfmoves = 0;
            // en-passant capture: the captured pawn is behind the ep square
            if (move.to === prevEp) {
                const capturedSquare = prevEp + (turn === 'white' ? -8 : 8);
                epCapture = this.board.take(capturedSquare);
            }
            // detect double-step to set epSquare for opponent
            const delta = move.from - move.to;
            if (Math.abs(delta) === 16 && 8 <= move.from && move.from <= 55) {
                this.epSquare = (move.from + move.to) >> 1;
            }
            // promotion handling
            if (move.promotion) {
                piece.role = move.promotion;
                piece.promoted = !!this.pockets;
            }
            // perform normal pawn move (this will also handle normal capture)
            const capture = this.board.set(move.to, piece) || epCapture;
            if (capture)
                this.playCaptureAt(move.to, capture);
            // done
            if (!castling)
                return;
        }
        // --- Painter behavior (including painting and painter-EP painting) ---
        else if (piece.role === 'painter' || piece.role === 'royalpainter') {
            // painting is considered a capture-like action -> reset halfmove clock
            this.halfmoves = 0;
            // Painter: special en-passant "paint" of an enemy double-pusher
            // Note: painters do NOT move onto the square they paint; they stay on move.from.
            if (move.to === prevEp && piece.role === 'painter') {
                const victimSquare = prevEp + (turn === 'white' ? -8 : 8);
                const victim = this.board.get(victimSquare);
                if ((0, util_js_1.defined)(victim) && (victim.role === 'pawn' || victim.role === 'painter') && victim.color !== piece.color) {
                    // Paint the victim (replace with same role but with painter's color)
                    const painted = { role: victim.role, color: piece.color, promoted: victim.promoted };
                    this.board.set(victimSquare, painted);
                    // Painter stays on its origin square (move.from)
                    this.board.set(move.from, piece);
                    // epSquare consumed
                    this.epSquare = undefined;
                    return;
                }
            }
            // Normal painting capture: if destination has an enemy piece, paint it and do NOT move painter.
            const dest = this.board.get(move.to);
            if ((0, util_js_1.defined)(dest) && dest.color !== piece.color) {
                // Paint the destination piece
                const painted = { role: dest.role, color: piece.color, promoted: dest.promoted };
                this.board.set(move.to, painted);
                // Painter stays where it started
                this.board.set(move.from, piece);
                // If we painted a rook, update castling rights
                if (dest.role === 'rook')
                    this.castles.discardRook(move.to);
                return;
            }
            // Otherwise: painter moves like a pawn (may be a double-step)
            if (move.promotion) {
                piece.role = move.promotion;
                piece.promoted = !!this.pockets;
            }
            // compute delta BEFORE setting board; detect double-step to set epSquare
            const pDelta = move.from - move.to;
            if (Math.abs(pDelta) === 16 && 8 <= move.from && move.from <= 55) {
                this.epSquare = (move.from + move.to) >> 1;
            }
            // actually move painter (no painting occurred)
            const capture = this.board.set(move.to, piece) || undefined;
            if (capture)
                this.playCaptureAt(move.to, capture);
            return;
        }
        // --- Rook: discard its rook-castle origin file if moved ---
        else if (piece.role === 'rook') {
            this.castles.discardRook(move.from);
        }
        // --- King: handle castling ---
        else if (piece.role === 'king') {
            if (castling) {
                const rookFrom = this.castles.rook[turn][castling];
                if ((0, util_js_1.defined)(rookFrom)) {
                    const rook = this.board.take(rookFrom);
                    // move king to castled square
                    this.board.set((0, util_js_1.kingCastlesTo)(turn, castling), piece);
                    if (rook)
                        this.board.set((0, util_js_1.rookCastlesTo)(turn, castling), rook);
                }
                // discard color's castling rights
                this.castles.discardColor(turn);
                return;
            }
            this.castles.discardColor(turn);
        }
        // --- Snare / Rollingsnare: cannot capture; move only to empty squares ---
        else if (piece.role === 'snare' || piece.role === 'rollingsnare') {
            if (move.promotion) {
                piece.role = move.promotion;
                piece.promoted = !!this.pockets;
            }
            const destBefore = this.board.get(move.to);
            if ((0, util_js_1.defined)(destBefore)) {
                // snare cannot capture — do nothing
                return;
            }
            this.board.set(move.to, piece);
            // PGN/UI: if a capture flag existed, clear it (we didn't capture)
            if (move.capture)
                move.capture = false;
            return;
        }
        // --- Wizard: swaps with friendly piece, normal capture, or normal move ---
        else if (piece.role === 'wizard') {
            const destBefore = this.board.get(move.to);
            // 1) normal empty destination -> move
            if (!(0, util_js_1.defined)(destBefore)) {
                this.board.set(move.to, piece);
                return;
            }
            // 2) capture enemy -> normal capture
            if (destBefore.color !== turn) {
                const capture = this.board.set(move.to, piece) || undefined;
                if (capture)
                    this.playCaptureAt(move.to, capture);
                return;
            }
            // 3) destination occupied by friendly -> swap (wizard swaps places)
            if (destBefore.color === turn) {
                const swappedPiece = {
                    role: destBefore.role,
                    color: destBefore.color,
                    promoted: destBefore.promoted,
                    moved: true,
                };
                // allow promotion-as-swap for pawns if needed
                if (swappedPiece.role === 'pawn' &&
                    squareSet_js_1.SquareSet.backranks().has(move.from) &&
                    move.promotion) {
                    swappedPiece.role = move.promotion;
                    swappedPiece.promoted = !!this.pockets;
                }
                // perform swap
                this.board.set(move.to, piece); // wizard -> destination
                this.board.set(move.from, swappedPiece); // swapped piece -> wizard origin
                // discard rook castling rights if the swapped piece was a rook
                if (swappedPiece.role === 'rook')
                    this.castles.discardRook(move.to);
                return;
            }
        }
        // --- Archer special-case: ranged "hit" that leaves archer in place if long-range diagonal move ---
        else if (piece.role === 'archer') {
            const from = move.from;
            const to = move.to;
            const fileDelta = Math.abs((0, util_js_1.squareFile)(to) - (0, util_js_1.squareFile)(from));
            const rankDelta = Math.abs((0, util_js_1.squareRank)(to) - (0, util_js_1.squareRank)(from));
            const maxDelta = Math.max(fileDelta, rankDelta);
            // If it's a long-range diagonal (>1 and diagonal), archer hits but stays
            if (maxDelta > 1 && fileDelta === rankDelta) {
                const captured = this.board.take(to);
                // put the archer back on its original square
                this.board.set(from, piece);
                this.halfmoves = 0;
                if (captured)
                    this.playCaptureAt(to, captured);
                return;
            }
        }
        // Generic case for remaining piece types: move normally (including handling epCapture set earlier)
        if (!castling) {
            const capture = this.board.set(move.to, piece) || epCapture;
            if (capture)
                this.playCaptureAt(move.to, capture);
        }
        // update remainingChecks if used by UI/conditions
        if (this.remainingChecks) {
            if (this.isCheck())
                this.remainingChecks[turn] = Math.max(this.remainingChecks[turn] - 1, 0);
        }
    }
    simulateWizardMoveIsLegal(from, to, ctx) {
        const color = this.turn;
        const opponent = (0, util_js_1.opposite)(color);
        const target = this.board.get(to);
        // Build a temp piece map from the current board
        const tempPieceMap = new Map();
        for (const [sq, p] of this.board) {
            // shallow copy to avoid mutating originals
            tempPieceMap.set(sq, { ...p });
        }
        const movingPiece = tempPieceMap.get(from);
        if (!movingPiece)
            return false; // no piece at `from`
        tempPieceMap.delete(from);
        if (!target) {
            // plain move
            const movedPiece = { ...movingPiece, square: to, moved: true };
            tempPieceMap.set(to, movedPiece);
        }
        else if (target.color !== color) {
            // capture
            tempPieceMap.delete(to);
            const movedPiece = { ...movingPiece, square: to, moved: true };
            tempPieceMap.set(to, movedPiece);
        }
        else {
            const swappedPiece = tempPieceMap.get(to);
            const newWizard = { ...movingPiece, square: to, moved: true };
            const newTarget = { ...swappedPiece, square: from, moved: true };
            tempPieceMap.set(to, newWizard);
            tempPieceMap.set(from, newTarget);
        }
        // Build temp occupied from tempPieceMap
        let tempOccupied = squareSet_js_1.SquareSet.empty();
        for (const sq of tempPieceMap.keys()) {
            tempOccupied = tempOccupied.union(squareSet_js_1.SquareSet.fromSquare(sq));
        }
        // Locate king after applying the simulated move/swap
        let kingSq;
        for (const [sq, p] of tempPieceMap) {
            if (p.role === 'king' && p.color === color) {
                kingSq = sq;
                break;
            }
        }
        if (kingSq === undefined)
            return false;
        // Build a temporary Board that mirrors tempPieceMap (so attackers see the simulated position)
        const tempBoard = board_js_1.Board.empty();
        tempBoard.clear();
        for (const [sq, p] of tempPieceMap) {
            tempBoard.set(sq, p);
        }
        // Final legality checl: king must not be attacked in the simulated position
        const attackers = attacksTo(kingSq, opponent, tempBoard, tempOccupied);
        return attackers.isEmpty();
    }
}
exports.Position = Position;
class Chess extends Position {
    constructor() {
        super('chess');
    }
    static default() {
        const pos = new this();
        pos.reset();
        return pos;
    }
    static fromSetup(setup) {
        const pos = new this();
        pos.setupUnchecked(setup);
        return pos.validate().map(_ => pos);
    }
    clone() {
        return super.clone();
    }
}
exports.Chess = Chess;
const validEpSquare = (pos, square) => {
    if (!(0, util_js_1.defined)(square))
        return;
    const epRank = pos.turn === 'white' ? 5 : 2;
    const forward = pos.turn === 'white' ? 8 : -8;
    if ((0, util_js_1.squareRank)(square) !== epRank)
        return;
    if (pos.board.occupied.has(square + forward))
        return;
    const pawn = square - forward;
    const target = pos.board.get(pawn);
    // Must be double-stepping pawn *or painter* of the opposite color
    if (!(0, util_js_1.defined)(target))
        return;
    if (target.color !== (0, util_js_1.opposite)(pos.turn))
        return;
    if (!(target.role === 'pawn' || target.role === 'painter'))
        return;
    return square;
};
const legalEpSquare = (pos) => {
    if (!(0, util_js_1.defined)(pos.epSquare))
        return;
    const ctx = pos.ctx();
    const ourEPers = pos.board.pieces(pos.turn, 'pawn')
        .union(pos.board.pieces(pos.turn, 'painter')); // painters move like pawns
    const candidates = ourEPers.intersect((0, attacks_js_1.pawnAttacks)((0, util_js_1.opposite)(pos.turn), pos.epSquare));
    for (const candidate of candidates) {
        if (pos.dests(candidate, ctx).has(pos.epSquare))
            return pos.epSquare;
    }
    return;
};
const canCaptureEp = (pos, pawnFrom, ctx) => {
    if (!(0, util_js_1.defined)(pos.epSquare))
        return false;
    if (!(0, attacks_js_1.pawnAttacks)(pos.turn, pawnFrom).has(pos.epSquare))
        return false;
    if (!(0, util_js_1.defined)(ctx.king))
        return true;
    const delta = pos.turn === 'white' ? 8 : -8;
    const captured = pos.epSquare - delta;
    const victim = pos.board.get(captured);
    if (!victim || !(victim.role === 'pawn' || victim.role === 'painter'))
        return false;
    return pos
        .kingAttackers(ctx.king, (0, util_js_1.opposite)(pos.turn), pos.board.occupied.toggle(pawnFrom).toggle(captured).with(pos.epSquare))
        .without(captured)
        .isEmpty();
};
const castlingDest = (pos, side, ctx) => {
    if (!(0, util_js_1.defined)(ctx.king) || ctx.checkers.nonEmpty())
        return squareSet_js_1.SquareSet.empty();
    const rook = pos.castles.rook[pos.turn][side];
    if (!(0, util_js_1.defined)(rook))
        return squareSet_js_1.SquareSet.empty();
    const rookPiece = pos.board.get(rook);
    if (!rookPiece || (rookPiece.role !== 'rook' && rookPiece.role !== 'champion'))
        return squareSet_js_1.SquareSet.empty();
    if (pos.castles.path[pos.turn][side].intersects(pos.board.occupied))
        return squareSet_js_1.SquareSet.empty();
    const kingTo = (0, util_js_1.kingCastlesTo)(pos.turn, side);
    const kingPath = (0, attacks_js_1.between)(ctx.king, kingTo);
    const occ = pos.board.occupied.without(ctx.king);
    for (const sq of kingPath) {
        if (pos.kingAttackers(sq, (0, util_js_1.opposite)(pos.turn), occ).nonEmpty())
            return squareSet_js_1.SquareSet.empty();
    }
    const rookTo = (0, util_js_1.rookCastlesTo)(pos.turn, side);
    const after = pos.board.occupied.toggle(ctx.king).toggle(rook).toggle(rookTo);
    if (pos.kingAttackers(kingTo, (0, util_js_1.opposite)(pos.turn), after).nonEmpty())
        return squareSet_js_1.SquareSet.empty();
    return squareSet_js_1.SquareSet.fromSquare(rook);
};
const snareZone = (pos, square, color) => {
    const front = color === 'white' ? square + 8 : square - 8;
    const left = square - 1;
    const right = square + 1;
    let zone = squareSet_js_1.SquareSet.empty();
    if (0 <= front && front < 64)
        zone = zone.with(front);
    if ((0, util_js_1.squareFile)(left) === (0, util_js_1.squareFile)(square) - 1)
        zone = zone.with(left);
    if ((0, util_js_1.squareFile)(right) === (0, util_js_1.squareFile)(square) + 1)
        zone = zone.with(right);
    return zone;
};
function rollingSnareZone(pos, sq, color) {
    let zone = snareZone(pos, sq, color);
    const behindDelta = color === 'white' ? -8 : 8;
    const behind = sq + behindDelta;
    if (0 <= behind && behind < 64) {
        zone = zone.with(behind);
    }
    return zone;
}
const pseudoDests = (pos, square, ctx) => {
    if (ctx.variantEnd)
        return squareSet_js_1.SquareSet.empty();
    const piece = pos.board.get(square);
    if (!piece || piece.color !== pos.turn)
        return squareSet_js_1.SquareSet.empty();
    // --- Snaring restriction ---
    let allSnareZones = squareSet_js_1.SquareSet.empty();
    for (const [sq, bPiece] of pos.board) {
        if (bPiece.role === 'snare' || bPiece.role === 'rollingsnare') {
            const zone = bPiece.role === 'snare'
                ? snareZone(this, sq, bPiece.color)
                : rollingSnareZone(this, sq, bPiece.color);
            for (const z of zone) {
                const target = pos.board.get(z);
                if ((0, util_js_1.defined)(target) && target.color !== bPiece.color) {
                    allSnareZones = allSnareZones.with(z);
                }
            }
        }
    }
    if (piece.role !== 'snare' && piece.role !== 'rollingsnare' && allSnareZones.has(square)) {
        return squareSet_js_1.SquareSet.empty();
    }
    // --- Normal pseudo move generation ---
    let pseudo;
    if (piece.role === 'pawn') {
        let captureTargets = pos.board[(0, util_js_1.opposite)(pos.turn)];
        if ((0, util_js_1.defined)(pos.epSquare))
            captureTargets = captureTargets.with(pos.epSquare);
        pseudo = (0, attacks_js_1.pawnAttacks)(pos.turn, square).intersect(captureTargets);
        const delta = pos.turn === 'white' ? 8 : -8;
        const step = square + delta;
        if (0 <= step && step < 64 && !pos.board.occupied.has(step)) {
            pseudo = pseudo.with(step);
            const canDoubleStep = pos.turn === 'white' ? square < 16 : square >= 48;
            const doubleStep = step + delta;
            if (canDoubleStep && !pos.board.occupied.has(doubleStep)) {
                pseudo = pseudo.with(doubleStep);
            }
        }
    }
    else if (piece.role === 'snare') {
        pseudo = (0, attacks_js_1.snareAttacks)(piece.color, square);
        // Snare cannot capture → remove all occupied squares
        pseudo = pseudo.diff(pos.board.white).diff(pos.board.black);
    }
    else if (piece.role === 'rollingsnare') {
        pseudo = (0, attacks_js_1.rollingsnareAttacks)(square);
        // cannot capture
        pseudo = pseudo.diff(pos.board.white).diff(pos.board.black);
    }
    else if (piece.role === 'wizard') {
        // Include friendlies - wizard can swap
        pseudo = (0, attacks_js_1.wizardAttacks)(square);
    }
    else {
        pseudo = (0, attacks_js_1.attacks)(piece, square, pos.board.occupied);
        pseudo = pseudo.diff(pos.board[pos.turn]);
    }
    if (square === ctx.king) {
        return pseudo.union(castlingDest(pos, 'a', ctx)).union(castlingDest(pos, 'h', ctx));
    }
    else {
        return pseudo;
    }
};
exports.pseudoDests = pseudoDests;
const equalsIgnoreMoves = (left, right) => {
    var _a, _b;
    return left.rules === right.rules
        && (0, board_js_1.boardEquals)(left.board, right.board)
        && ((right.pockets && ((_a = left.pockets) === null || _a === void 0 ? void 0 : _a.equals(right.pockets))) || (!left.pockets && !right.pockets))
        && left.turn === right.turn
        && left.castles.castlingRights.equals(right.castles.castlingRights)
        && legalEpSquare(left) === legalEpSquare(right)
        && ((right.remainingChecks && ((_b = left.remainingChecks) === null || _b === void 0 ? void 0 : _b.equals(right.remainingChecks)))
            || (!left.remainingChecks && !right.remainingChecks));
};
exports.equalsIgnoreMoves = equalsIgnoreMoves;
const castlingSide = (pos, move) => {
    if ((0, types_js_1.isDrop)(move))
        return;
    const delta = move.to - move.from;
    if (Math.abs(delta) !== 2 && !pos.board[pos.turn].has(move.to))
        return;
    if (!pos.board.king.has(move.from))
        return;
    return delta > 0 ? 'h' : 'a';
};
exports.castlingSide = castlingSide;
const normalizeMove = (pos, move) => {
    const side = (0, exports.castlingSide)(pos, move);
    if (!side)
        return move;
    const rookFrom = pos.castles.rook[pos.turn][side]; //bookmark
    return {
        from: move.from,
        to: (0, util_js_1.defined)(rookFrom) ? rookFrom : move.to,
    };
};
exports.normalizeMove = normalizeMove;
const isStandardMaterialSide = (board, color) => {
    const promoted = Math.max(board.pieces(color, 'queen').size() - 1, 0)
        + Math.max(board.pieces(color, 'rook').size() - 2, 0)
        + Math.max(board.pieces(color, 'knight').size() - 2, 0)
        + Math.max(board.pieces(color, 'bishop').intersect(squareSet_js_1.SquareSet.lightSquares()).size() - 1, 0)
        + Math.max(board.pieces(color, 'bishop').intersect(squareSet_js_1.SquareSet.darkSquares()).size() - 1, 0);
    return board.pieces(color, 'pawn').size() + promoted <= 8;
};
exports.isStandardMaterialSide = isStandardMaterialSide;
const isStandardMaterial = (pos) => types_js_1.COLORS.every(color => (0, exports.isStandardMaterialSide)(pos.board, color));
exports.isStandardMaterial = isStandardMaterial;
const isImpossibleCheck = (pos) => {
    const ourKing = pos.board.kingOf(pos.turn);
    if (!(0, util_js_1.defined)(ourKing))
        return false;
    const checkers = pos.kingAttackers(ourKing, (0, util_js_1.opposite)(pos.turn), pos.board.occupied);
    if (checkers.isEmpty())
        return false;
    if ((0, util_js_1.defined)(pos.epSquare)) {
        // The pushed pawn must be the only checker, or it has uncovered
        // check by a single sliding piece.
        const pushedTo = pos.epSquare ^ 8;
        const pushedFrom = pos.epSquare ^ 24;
        return (checkers.moreThanOne()
            || (checkers.first() !== pushedTo
                && pos
                    .kingAttackers(ourKing, (0, util_js_1.opposite)(pos.turn), pos.board.occupied.without(pushedTo).with(pushedFrom))
                    .nonEmpty()));
    }
    else if (pos.rules === 'atomic') {
        // Other king moving away can cause many checks to be given at the same
        // time. Not checking details, or even that the king is close enough.
        return false;
    }
    else {
        // Sliding checkers aligned with king.
        return checkers.size() > 2 || (checkers.size() === 2 && (0, attacks_js_1.ray)(checkers.first(), checkers.last()).has(ourKing));
    }
};
exports.isImpossibleCheck = isImpossibleCheck;
//# sourceMappingURL=chess.js.map