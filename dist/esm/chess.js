import { Result } from '@badrap/result';
import { attacks, between, bishopAttacks, kingAttacks, knightAttacks, pawnAttacks, queenAttacks, ray, rookAttacks, championAttacks, princessAttacks, amazonAttacks, mannAttacks, painterAttacks, royalpainterAttacks, snareAttacks, wizardAttacks, archerAttacks, rollingsnareAttacks } from './attacks.js';
import { FILE_RANGE, RANK_RANGE, DIAG_RANGE, ANTI_DIAG_RANGE, ARCHER_DELTAS } from "./attacks.js";
import { Board, boardEquals } from './board.js';
import { SquareSet } from './squareSet.js';
import { CASTLING_SIDES, COLORS, isDrop } from './types.js';
import { defined, kingCastlesTo, opposite, rookCastlesTo, squareRank, squareFile } from './util.js';
export var IllegalSetup;
(function (IllegalSetup) {
    IllegalSetup["Empty"] = "ERR_EMPTY";
    IllegalSetup["OppositeCheck"] = "ERR_OPPOSITE_CHECK";
    IllegalSetup["PawnsOnBackrank"] = "ERR_PAWNS_ON_BACKRANK";
    IllegalSetup["Kings"] = "ERR_KINGS";
    IllegalSetup["Variant"] = "ERR_VARIANT";
})(IllegalSetup || (IllegalSetup = {}));
export class PositionError extends Error {
}
const attacksTo = (square, attacker, board, occupied) => board[attacker].intersect(rookAttacks(square, occupied)
    .intersect(board.rooksAndQueens())
    .union(bishopAttacks(square, occupied).intersect(board.bishopsAndQueens()))
    .union(knightAttacks(square).intersect(board.knight))
    .union(kingAttacks(square).intersect(board.king))
    .union(pawnAttacks(opposite(attacker), square).intersect(board.pawn))
    .union(championAttacks(square, occupied).intersect(board.champion))
    .union(princessAttacks(square, occupied).intersect(board.princess))
    .union(amazonAttacks(square, occupied).intersect(board.amazon))
    .union(mannAttacks(square).intersect(board.mann))
    .union(painterAttacks(opposite(attacker), square).intersect(board.painter))
    .union(wizardAttacks(square).intersect(board.wizard))
    .union(archerAttacks(square, occupied).intersect(board.archer))
    .union(royalpainterAttacks(square, occupied).intersect(board.royalpainter)));
export class Castles {
    constructor() { }
    static default() {
        const castles = new Castles();
        castles.castlingRights = SquareSet.corners();
        castles.rook = {
            white: { a: 0, h: 7 },
            black: { a: 56, h: 63 },
        };
        castles.path = {
            white: { a: new SquareSet(0xe, 0), h: new SquareSet(0x60, 0) },
            black: { a: new SquareSet(0, 0x0e000000), h: new SquareSet(0, 0x60000000) },
        };
        return castles;
    }
    static empty() {
        const castles = new Castles();
        castles.castlingRights = SquareSet.empty();
        castles.rook = {
            white: { a: undefined, h: undefined },
            black: { a: undefined, h: undefined },
        };
        castles.path = {
            white: { a: SquareSet.empty(), h: SquareSet.empty() },
            black: { a: SquareSet.empty(), h: SquareSet.empty() },
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
        const kingTo = kingCastlesTo(color, side);
        const rookTo = rookCastlesTo(color, side);
        this.castlingRights = this.castlingRights.with(rook);
        this.rook[color][side] = rook;
        this.path[color][side] = between(rook, rookTo)
            .with(rookTo)
            .union(between(king, kingTo).with(kingTo))
            .without(king)
            .without(rook);
    }
    static fromSetup(setup) {
        const castles = Castles.empty();
        const castlers = setup.castlingRights.intersect(setup.board.rook.union(setup.board.champion));
        for (const color of COLORS) {
            const backrank = SquareSet.backrank(color);
            const king = setup.board.kingOf(color);
            if (!defined(king) || !backrank.has(king))
                continue;
            const side = castlers.intersect(setup.board[color]).intersect(backrank);
            const aSide = side.first();
            if (defined(aSide) && aSide < king)
                castles.add(color, 'a', king, aSide);
            const hSide = side.last();
            if (defined(hSide) && king < hSide)
                castles.add(color, 'h', king, hSide);
        }
        return castles;
    }
    discardRook(square) {
        if (this.castlingRights.has(square)) {
            this.castlingRights = this.castlingRights.without(square);
            for (const color of COLORS) {
                for (const side of CASTLING_SIDES) {
                    if (this.rook[color][side] === square)
                        this.rook[color][side] = undefined;
                }
            }
        }
    }
    discardColor(color) {
        this.castlingRights = this.castlingRights.diff(SquareSet.backrank(color));
        this.rook[color].a = undefined;
        this.rook[color].h = undefined;
    }
}
export class Position {
    constructor(rules) {
        this.rules = rules;
    }
    reset() {
        this.board = Board.default();
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
        this.board.promoted = SquareSet.empty();
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
            this.pockets[opposite(captured.color)][captured.promoted ? 'pawn' : captured.role]++;
    }
    ctx() {
        const variantEnd = this.isVariantEnd();
        const king = this.board.kingOf(this.turn);
        if (!defined(king)) {
            return { king, blockers: SquareSet.empty(), checkers: SquareSet.empty(), variantEnd, mustCapture: false };
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
        const rookLines = FILE_RANGE[king].union(RANK_RANGE[king]);
        const bishopLines = DIAG_RANGE[king].union(ANTI_DIAG_RANGE[king]);
        // candidate slider snipers ignoring occupancy
        const sliderSnipers = rookLikeSliders
            .intersect(rookLines)
            .union(bishopLikeSliders.intersect(bishopLines))
            .intersect(this.board[opposite(this.turn)]);
        let archerSnipers = SquareSet.empty();
        for (const d of ARCHER_DELTAS) {
            for (let step = 2; step <= 3; step++) {
                const sq = king + d * step;
                // bounds check and file-wrap check
                if (!(0 <= sq && sq < 64))
                    continue;
                if (Math.abs(squareFile(sq) - squareFile(king)) !== step)
                    continue;
                // only keep if there's an opponent archer on that square
                if (this.board[opposite(this.turn)].has(sq) && this.board.archer.has(sq)) {
                    archerSnipers = archerSnipers.with(sq);
                }
            }
        }
        const snipers = sliderSnipers.union(archerSnipers);
        let blockers = SquareSet.empty();
        for (const sniper of snipers) {
            const b = between(king, sniper).intersect(this.board.occupied);
            if (!b.moreThanOne())
                blockers = blockers.union(b);
        }
        const checkers = this.kingAttackers(king, opposite(this.turn), this.board.occupied);
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
            return Result.err(new PositionError(IllegalSetup.Empty));
        if (this.board.king.size() !== 2)
            return Result.err(new PositionError(IllegalSetup.Kings));
        if (!defined(this.board.kingOf(this.turn)))
            return Result.err(new PositionError(IllegalSetup.Kings));
        const otherKing = this.board.kingOf(opposite(this.turn));
        if (!defined(otherKing))
            return Result.err(new PositionError(IllegalSetup.Kings));
        if (this.kingAttackers(otherKing, this.turn, this.board.occupied).nonEmpty()) {
            return Result.err(new PositionError(IllegalSetup.OppositeCheck));
        }
        if (SquareSet.backranks().intersects(this.board.pawn)) {
            return Result.err(new PositionError(IllegalSetup.PawnsOnBackrank));
        }
        return Result.ok(undefined);
    }
    dropDests(_ctx) {
        return SquareSet.empty();
    }
    dests(square, ctx) {
        ctx = ctx || this.ctx();
        if (ctx.variantEnd)
            return SquareSet.empty();
        const piece = this.board.get(square);
        if (!piece || piece.color !== this.turn)
            return SquareSet.empty();
        // --- Snaring restriction ---
        let allSnareZones = SquareSet.empty();
        for (const [sq, bPiece] of this.board) {
            if (bPiece.role === 'snare' || bPiece.role === 'rollingsnare') {
                const zone = bPiece.role === 'snare'
                    ? snareZone(this, sq, bPiece.color)
                    : rollingSnareZone(this, sq, bPiece.color);
                for (const z of zone) {
                    const target = this.board.get(z);
                    if (defined(target) && target.color !== bPiece.color) {
                        allSnareZones = allSnareZones.with(z);
                    }
                }
            }
        }
        if (allSnareZones.has(square)) {
            return SquareSet.empty();
        }
        let pseudo;
        let legal;
        if (piece.role === 'pawn' || piece.role === 'painter') {
            pseudo = pawnAttacks(this.turn, square).intersect(this.board[opposite(this.turn)]);
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
            if (defined(this.epSquare) && canCaptureEp(this, square, ctx)) {
                legal = SquareSet.fromSquare(this.epSquare);
            }
        }
        else if (piece.role === 'bishop')
            pseudo = bishopAttacks(square, this.board.occupied);
        else if (piece.role === 'knight')
            pseudo = knightAttacks(square);
        else if (piece.role === 'rook')
            pseudo = rookAttacks(square, this.board.occupied);
        else if (piece.role === 'queen')
            pseudo = queenAttacks(square, this.board.occupied);
        else if (piece.role === 'champion')
            pseudo = knightAttacks(square).xor(rookAttacks(square, this.board.occupied));
        else if (piece.role === 'princess')
            pseudo = bishopAttacks(square, this.board.occupied).xor(knightAttacks(square));
        else if (piece.role === 'amazon')
            pseudo = queenAttacks(square, this.board.occupied).xor(knightAttacks(square));
        else if (piece.role === 'mann')
            pseudo = mannAttacks(square);
        else if (piece.role === 'royalpainter')
            pseudo = royalpainterAttacks(square, this.board.occupied);
        else if (piece.role === 'snare') {
            pseudo = snareAttacks(piece.color, square);
            // Snare cannot capture
            pseudo = pseudo.diff(this.board.white).diff(this.board.black);
        }
        else if (piece.role === 'rollingsnare') {
            pseudo = rollingsnareAttacks(square);
            // cannot capture
            pseudo = pseudo.diff(this.board.white).diff(this.board.black);
        }
        else if (piece.role === 'wizard') {
            pseudo = wizardAttacks(square);
        }
        else if (piece.role == 'archer') {
            pseudo = archerAttacks(square, this.board.occupied);
        }
        else
            pseudo = kingAttacks(square);
        if (piece.role !== 'wizard') {
            pseudo = pseudo.diff(this.board[this.turn]);
        }
        if (defined(ctx.king)) {
            if (piece.role === 'king') {
                const occ = this.board.occupied.without(square);
                for (const to of pseudo) {
                    if (this.kingAttackers(to, opposite(this.turn), occ).nonEmpty())
                        pseudo = pseudo.without(to);
                }
                return pseudo.union(castlingDest(this, 'a', ctx)).union(castlingDest(this, 'h', ctx));
            }
            // In check
            if (ctx.checkers.nonEmpty()) {
                if (piece.role === 'wizard') {
                    // allow wizard destinations that after simulation leave king safe
                    let allowed = SquareSet.empty();
                    for (const to of pseudo) {
                        if (this.simulateWizardMoveIsLegal(square, to, ctx))
                            allowed = allowed.with(to);
                    }
                    pseudo = allowed;
                }
                else {
                    const checker = ctx.checkers.singleSquare();
                    if (!defined(checker))
                        return SquareSet.empty();
                    pseudo = pseudo.intersect(between(checker, ctx.king).with(checker));
                }
            }
            // Pinned
            if (ctx.blockers.has(square)) {
                if (piece.role === 'painter') {
                    // painter pin exception logic
                    let captureSquares = this.board[opposite(this.turn)];
                    if (defined(this.epSquare) && canCaptureEp(this, square, ctx)) {
                        captureSquares = captureSquares.with(this.epSquare);
                    }
                    const capturesOnly = pseudo.intersect(captureSquares);
                    const nonCapture = pseudo.diff(captureSquares).intersect(ray(square, ctx.king));
                    pseudo = capturesOnly.union(nonCapture);
                }
                else if (piece.role === 'wizard') {
                    // wizard pin exception logic
                    let allowed = SquareSet.empty();
                    for (const to of pseudo) {
                        if (this.simulateWizardMoveIsLegal(square, to, ctx))
                            allowed = allowed.with(to);
                    }
                    pseudo = allowed;
                }
                else {
                    pseudo = pseudo.intersect(ray(square, ctx.king));
                }
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
        const opp = this.board[opposite(color)];
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
            const bishopsOnDark = sideBishops.intersects(SquareSet.darkSquares());
            const bishopsOnLight = sideBishops.intersects(SquareSet.lightSquares());
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
        return COLORS.every(color => this.hasInsufficientMaterial(color));
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
        if (isDrop(move)) {
            if (!this.pockets || this.pockets[this.turn][move.role] <= 0)
                return false;
            if ((move.role === 'pawn') && SquareSet.backranks().has(move.to))
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
                willRequirePromotion = SquareSet.backranks().has(move.to);
            }
            else if (fromIsWizard && targetPiece && targetPiece.role === 'pawn' && targetPiece.color === this.turn) {
                willRequirePromotion = SquareSet.backranks().has(move.from);
            }
            else {
                willRequirePromotion = false;
            }
            if (!!move.promotion !== willRequirePromotion)
                return false;
            const dests = this.dests(move.from, ctx);
            return dests.has(move.to) || dests.has(normalizeMove(this, move).to);
        }
    }
    isCheck() {
        const king = this.board.kingOf(this.turn);
        return defined(king) && this.kingAttackers(king, opposite(this.turn), this.board.occupied).nonEmpty();
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
            return { winner: opposite(this.turn) };
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
        const epSquare = this.epSquare;
        const castling = castlingSide(this, move);
        this.epSquare = undefined;
        this.halfmoves += 1;
        if (turn === 'black')
            this.fullmoves += 1;
        this.turn = opposite(turn);
        if (isDrop(move)) {
            this.board.set(move.to, { role: move.role, color: turn });
            if (this.pockets)
                this.pockets[turn][move.role]--;
            if (move.role === 'pawn')
                this.halfmoves = 0;
        }
        else {
            const piece = this.board.take(move.from);
            if (!piece)
                return;
            let epCapture;
            if (piece.role === 'pawn') {
                this.halfmoves = 0;
                if (move.to === epSquare) {
                    epCapture = this.board.take(move.to + (turn === 'white' ? -8 : 8));
                }
                const delta = move.from - move.to;
                if (Math.abs(delta) === 16 && 8 <= move.from && move.from <= 55) {
                    this.epSquare = (move.from + move.to) >> 1;
                }
                if (move.promotion) {
                    piece.role = move.promotion;
                    piece.promoted = !!this.pockets;
                }
            }
            else if (piece.role === 'painter' || piece.role === 'royalpainter') {
                // Reset halfmove clock (like a capture)
                this.halfmoves = 0;
                // painter's special en passant
                if (move.to === epSquare && piece.role === 'painter') {
                    const wouldBeCapturedSquare = move.to + (turn === 'white' ? -8 : 8);
                    const target = this.board.get(wouldBeCapturedSquare);
                    if (defined(target) && target.role === 'pawn' && target.color !== piece.color) {
                        // Save undo info (original target state)
                        const prevTarget = { role: target.role, color: target.color, promoted: target.promoted };
                        // Paint the pawn
                        const paintedPawn = { role: target.role, color: piece.color, promoted: target.promoted };
                        this.board.set(wouldBeCapturedSquare, paintedPawn);
                        // Painter stays on its original square 
                        this.board.set(move.from, piece);
                        this.epSquare = undefined;
                        return;
                    }
                }
                // Normal painter behavior (painting on destination if enemy piece exists)
                const target = this.board.get(move.to);
                if (defined(target) && target.color !== piece.color) {
                    const prevTarget = { role: target.role, color: target.color, promoted: target.promoted };
                    const paintedPiece = { role: target.role, color: piece.color, promoted: target.promoted };
                    this.board.set(move.to, paintedPiece);
                    // Painter does NOT move
                    this.board.set(move.from, piece);
                    if (prevTarget.role === 'rook') {
                        this.castles.discardRook(move.to);
                    }
                    return;
                }
                else {
                    // No piece to paint: painter moves normally (like a pawn)
                    if (move.promotion) {
                        piece.role = move.promotion;
                        piece.promoted = !!this.pockets;
                    }
                    const capture = this.board.set(move.to, piece) || undefined;
                    if (capture)
                        this.playCaptureAt(move.to, capture);
                }
            }
            else if (piece.role === 'rook') {
                this.castles.discardRook(move.from);
            }
            else if (piece.role === 'king') {
                if (castling) {
                    const rookFrom = this.castles.rook[turn][castling];
                    if (defined(rookFrom)) {
                        const rook = this.board.take(rookFrom);
                        this.board.set(kingCastlesTo(turn, castling), piece);
                        if (rook)
                            this.board.set(rookCastlesTo(turn, castling), rook);
                    }
                }
                this.castles.discardColor(turn);
            }
            else if (piece.role === 'snare' || piece.role === 'rollingsnare') {
                if (move.promotion) {
                    piece.role = move.promotion;
                    piece.promoted = !!this.pockets;
                }
                const destBefore = this.board.get(move.to);
                if (defined(destBefore)) {
                    // snare cannot capture
                    return;
                }
                this.board.set(move.to, piece);
                // being used by the PGN writer or UI after play().
                if (move.capture)
                    move.capture = false;
                // Return early to avoid generic capture-handlers
                return;
            }
            else if (piece.role === 'wizard') {
                const destBefore = this.board.get(move.to);
                // 1) normal move
                if (!defined(destBefore)) {
                    this.board.set(move.to, piece);
                    // from already cleared by board.take
                    return;
                }
                // 2) normal capture
                if (destBefore.color !== turn) {
                    const capture = this.board.set(move.to, piece) || undefined;
                    if (capture)
                        this.playCaptureAt(move.to, capture);
                    return;
                }
                // 3) Destination occupied by friendly -> swap
                if (destBefore.color === turn) {
                    const swappedPiece = { role: destBefore.role, color: destBefore.color, promoted: destBefore.promoted, moved: true };
                    if (swappedPiece.role === 'pawn' &&
                        SquareSet.backranks().has(move.from) &&
                        move.promotion) {
                        swappedPiece.role = move.promotion;
                        swappedPiece.promoted = !!this.pockets;
                    }
                    // Move the wizard to the target square.
                    this.board.set(move.to, piece);
                    // Put the swapped piece at the wizard's origin.
                    this.board.set(move.from, swappedPiece);
                    // discard castling rights if needed
                    if (swappedPiece.role === 'rook') {
                        this.castles.discardRook(move.to);
                    }
                    return;
                }
            }
            else if (piece.role === 'archer') {
                const from = move.from;
                const to = move.to;
                const fileDelta = Math.abs(squareFile(to) - squareFile(from));
                const rankDelta = Math.abs(squareRank(to) - squareRank(from));
                const maxDelta = Math.max(fileDelta, rankDelta);
                if (maxDelta > 1 && (fileDelta === rankDelta)) {
                    const captured = this.board.take(to);
                    this.board.set(from, piece);
                    this.halfmoves = 0;
                    return;
                }
            }
            if (!castling) {
                const capture = this.board.set(move.to, piece) || epCapture;
                if (capture)
                    this.playCaptureAt(move.to, capture);
            }
        }
        if (this.remainingChecks) {
            if (this.isCheck())
                this.remainingChecks[turn] = Math.max(this.remainingChecks[turn] - 1, 0);
        }
    }
    simulateWizardMoveIsLegal(from, to, ctx) {
        const color = this.turn;
        const opponent = opposite(color);
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
        let tempOccupied = SquareSet.empty();
        for (const sq of tempPieceMap.keys()) {
            tempOccupied = tempOccupied.union(SquareSet.fromSquare(sq));
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
        const tempBoard = Board.empty();
        tempBoard.clear();
        for (const [sq, p] of tempPieceMap) {
            tempBoard.set(sq, p);
        }
        // Final legality checl: king must not be attacked in the simulated position
        const attackers = attacksTo(kingSq, opponent, tempBoard, tempOccupied);
        return attackers.isEmpty();
    }
}
export class Chess extends Position {
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
const validEpSquare = (pos, square) => {
    if (!defined(square))
        return;
    const epRank = pos.turn === 'white' ? 5 : 2;
    const forward = pos.turn === 'white' ? 8 : -8;
    if (squareRank(square) !== epRank)
        return;
    if (pos.board.occupied.has(square + forward))
        return;
    const pawn = square - forward;
    if (!pos.board.pawn.has(pawn) || !pos.board[opposite(pos.turn)].has(pawn))
        return;
    return square;
};
const legalEpSquare = (pos) => {
    if (!defined(pos.epSquare))
        return;
    const ctx = pos.ctx();
    const ourPawns = pos.board.pieces(pos.turn, 'pawn');
    const candidates = ourPawns.intersect(pawnAttacks(opposite(pos.turn), pos.epSquare));
    for (const candidate of candidates) {
        if (pos.dests(candidate, ctx).has(pos.epSquare))
            return pos.epSquare;
    }
    return;
};
const canCaptureEp = (pos, pawnFrom, ctx) => {
    if (!defined(pos.epSquare))
        return false;
    if (!pawnAttacks(pos.turn, pawnFrom).has(pos.epSquare))
        return false;
    if (!defined(ctx.king))
        return true;
    const delta = pos.turn === 'white' ? 8 : -8;
    const captured = pos.epSquare - delta;
    return pos
        .kingAttackers(ctx.king, opposite(pos.turn), pos.board.occupied.toggle(pawnFrom).toggle(captured).with(pos.epSquare))
        .without(captured)
        .isEmpty();
};
const castlingDest = (pos, side, ctx) => {
    if (!defined(ctx.king) || ctx.checkers.nonEmpty())
        return SquareSet.empty();
    const rook = pos.castles.rook[pos.turn][side];
    if (!defined(rook))
        return SquareSet.empty();
    const rookPiece = pos.board.get(rook);
    if (!rookPiece || (rookPiece.role !== 'rook' && rookPiece.role !== 'champion'))
        return SquareSet.empty();
    if (pos.castles.path[pos.turn][side].intersects(pos.board.occupied))
        return SquareSet.empty();
    const kingTo = kingCastlesTo(pos.turn, side);
    const kingPath = between(ctx.king, kingTo);
    const occ = pos.board.occupied.without(ctx.king);
    for (const sq of kingPath) {
        if (pos.kingAttackers(sq, opposite(pos.turn), occ).nonEmpty())
            return SquareSet.empty();
    }
    const rookTo = rookCastlesTo(pos.turn, side);
    const after = pos.board.occupied.toggle(ctx.king).toggle(rook).toggle(rookTo);
    if (pos.kingAttackers(kingTo, opposite(pos.turn), after).nonEmpty())
        return SquareSet.empty();
    return SquareSet.fromSquare(rook);
};
const snareZone = (pos, square, color) => {
    const front = color === 'white' ? square + 8 : square - 8;
    const left = square - 1;
    const right = square + 1;
    let zone = SquareSet.empty();
    if (0 <= front && front < 64)
        zone = zone.with(front);
    if (squareFile(left) === squareFile(square) - 1)
        zone = zone.with(left);
    if (squareFile(right) === squareFile(square) + 1)
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
export const pseudoDests = (pos, square, ctx) => {
    if (ctx.variantEnd)
        return SquareSet.empty();
    const piece = pos.board.get(square);
    if (!piece || piece.color !== pos.turn)
        return SquareSet.empty();
    // --- Snaring restriction ---
    let allSnareZones = SquareSet.empty();
    for (const [sq, bPiece] of pos.board) {
        if (bPiece.role === 'snare' || bPiece.role === 'rollingsnare') {
            const zone = bPiece.role === 'snare'
                ? snareZone(this, sq, bPiece.color)
                : rollingSnareZone(this, sq, bPiece.color);
            for (const z of zone) {
                const target = pos.board.get(z);
                if (defined(target) && target.color !== bPiece.color) {
                    allSnareZones = allSnareZones.with(z);
                }
            }
        }
    }
    if (piece.role !== 'snare' && piece.role !== 'rollingsnare' && allSnareZones.has(square)) {
        return SquareSet.empty();
    }
    // --- Normal pseudo move generation ---
    let pseudo;
    if (piece.role === 'pawn') {
        let captureTargets = pos.board[opposite(pos.turn)];
        if (defined(pos.epSquare))
            captureTargets = captureTargets.with(pos.epSquare);
        pseudo = pawnAttacks(pos.turn, square).intersect(captureTargets);
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
        pseudo = snareAttacks(piece.color, square);
        // Snare cannot capture → remove all occupied squares
        pseudo = pseudo.diff(pos.board.white).diff(pos.board.black);
    }
    else if (piece.role === 'rollingsnare') {
        pseudo = rollingsnareAttacks(square);
        // cannot capture
        pseudo = pseudo.diff(pos.board.white).diff(pos.board.black);
    }
    else if (piece.role === 'wizard') {
        // Include friendlies - wizard can swap
        pseudo = wizardAttacks(square);
    }
    else {
        pseudo = attacks(piece, square, pos.board.occupied);
        pseudo = pseudo.diff(pos.board[pos.turn]);
    }
    if (square === ctx.king) {
        return pseudo.union(castlingDest(pos, 'a', ctx)).union(castlingDest(pos, 'h', ctx));
    }
    else {
        return pseudo;
    }
};
export const equalsIgnoreMoves = (left, right) => {
    var _a, _b;
    return left.rules === right.rules
        && boardEquals(left.board, right.board)
        && ((right.pockets && ((_a = left.pockets) === null || _a === void 0 ? void 0 : _a.equals(right.pockets))) || (!left.pockets && !right.pockets))
        && left.turn === right.turn
        && left.castles.castlingRights.equals(right.castles.castlingRights)
        && legalEpSquare(left) === legalEpSquare(right)
        && ((right.remainingChecks && ((_b = left.remainingChecks) === null || _b === void 0 ? void 0 : _b.equals(right.remainingChecks)))
            || (!left.remainingChecks && !right.remainingChecks));
};
export const castlingSide = (pos, move) => {
    if (isDrop(move))
        return;
    const delta = move.to - move.from;
    if (Math.abs(delta) !== 2 && !pos.board[pos.turn].has(move.to))
        return;
    if (!pos.board.king.has(move.from))
        return;
    return delta > 0 ? 'h' : 'a';
};
export const normalizeMove = (pos, move) => {
    const side = castlingSide(pos, move);
    if (!side)
        return move;
    const rookFrom = pos.castles.rook[pos.turn][side]; //bookmark
    return {
        from: move.from,
        to: defined(rookFrom) ? rookFrom : move.to,
    };
};
export const isStandardMaterialSide = (board, color) => {
    const promoted = Math.max(board.pieces(color, 'queen').size() - 1, 0)
        + Math.max(board.pieces(color, 'rook').size() - 2, 0)
        + Math.max(board.pieces(color, 'knight').size() - 2, 0)
        + Math.max(board.pieces(color, 'bishop').intersect(SquareSet.lightSquares()).size() - 1, 0)
        + Math.max(board.pieces(color, 'bishop').intersect(SquareSet.darkSquares()).size() - 1, 0);
    return board.pieces(color, 'pawn').size() + promoted <= 8;
};
export const isStandardMaterial = (pos) => COLORS.every(color => isStandardMaterialSide(pos.board, color));
export const isImpossibleCheck = (pos) => {
    const ourKing = pos.board.kingOf(pos.turn);
    if (!defined(ourKing))
        return false;
    const checkers = pos.kingAttackers(ourKing, opposite(pos.turn), pos.board.occupied);
    if (checkers.isEmpty())
        return false;
    if (defined(pos.epSquare)) {
        // The pushed pawn must be the only checker, or it has uncovered
        // check by a single sliding piece.
        const pushedTo = pos.epSquare ^ 8;
        const pushedFrom = pos.epSquare ^ 24;
        return (checkers.moreThanOne()
            || (checkers.first() !== pushedTo
                && pos
                    .kingAttackers(ourKing, opposite(pos.turn), pos.board.occupied.without(pushedTo).with(pushedFrom))
                    .nonEmpty()));
    }
    else if (pos.rules === 'atomic') {
        // Other king moving away can cause many checks to be given at the same
        // time. Not checking details, or even that the king is close enough.
        return false;
    }
    else {
        // Sliding checkers aligned with king.
        return checkers.size() > 2 || (checkers.size() === 2 && ray(checkers.first(), checkers.last()).has(ourKing));
    }
};
//# sourceMappingURL=chess.js.map