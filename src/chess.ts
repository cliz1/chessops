import { Result } from '@badrap/result';
import {
  attacks,
  between,
  bishopAttacks,
  kingAttacks,
  knightAttacks,
  pawnAttacks,
  queenAttacks,
  ray,
  rookAttacks,
  championAttacks,
  princessAttacks,
  amazonAttacks,
  mannAttacks,
  painterAttacks,
  royalpainterAttacks,
  snareAttacks,
  wizardAttacks,
  archerAttacks,
  rollingsnareAttacks
} from './attacks.js';
import { FILE_RANGE, RANK_RANGE, DIAG_RANGE, ANTI_DIAG_RANGE, ARCHER_DELTAS } from "./attacks.js";
import { Board, boardEquals } from './board.js';
import { Material, RemainingChecks, Setup } from './setup.js';
import { SquareSet } from './squareSet.js';
import {
  ByCastlingSide,
  ByColor,
  CASTLING_SIDES,
  CastlingSide,
  Color,
  COLORS,
  isDrop,
  Move,
  NormalMove,
  Outcome,
  Piece,
  Rules,
  Square
} from './types.js';
import { defined, kingCastlesTo, opposite, rookCastlesTo, squareRank, squareFile } from './util.js';

export enum IllegalSetup {
  Empty = 'ERR_EMPTY',
  OppositeCheck = 'ERR_OPPOSITE_CHECK',
  PawnsOnBackrank = 'ERR_PAWNS_ON_BACKRANK',
  Kings = 'ERR_KINGS',
  Variant = 'ERR_VARIANT',
}

export class PositionError extends Error {}

const attacksTo = (square: Square, attacker: Color, board: Board, occupied: SquareSet): SquareSet =>
  board[attacker].intersect(
    rookAttacks(square, occupied)
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
      .union(royalpainterAttacks(square, occupied).intersect(board.royalpainter))
  );

export class Castles {
  castlingRights: SquareSet;
  rook: ByColor<ByCastlingSide<Square | undefined>>;
  path: ByColor<ByCastlingSide<SquareSet>>;

  private constructor() {}

  static default(): Castles {
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

  static empty(): Castles {
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

  clone(): Castles {
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

  private add(color: Color, side: CastlingSide, king: Square, rook: Square): void {
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

  static fromSetup(setup: Setup): Castles {
    const castles = Castles.empty();
    const castlers = setup.castlingRights.intersect(setup.board.rook.union(setup.board.champion));
    for (const color of COLORS) {
      const backrank = SquareSet.backrank(color);
      const king = setup.board.kingOf(color);
      if (!defined(king) || !backrank.has(king)) continue;
      const side = castlers.intersect(setup.board[color]).intersect(backrank);
      const aSide = side.first();
      if (defined(aSide) && aSide < king) castles.add(color, 'a', king, aSide);
      const hSide = side.last();
      if (defined(hSide) && king < hSide) castles.add(color, 'h', king, hSide);
    }
    return castles;
  }

  discardRook(square: Square): void {
    if (this.castlingRights.has(square)) {
      this.castlingRights = this.castlingRights.without(square);
      for (const color of COLORS) {
        for (const side of CASTLING_SIDES) {
          if (this.rook[color][side] === square) this.rook[color][side] = undefined;
        }
      }
    }
  }

  discardColor(color: Color): void {
    this.castlingRights = this.castlingRights.diff(SquareSet.backrank(color));
    this.rook[color].a = undefined;
    this.rook[color].h = undefined;
  }
}

export interface Context {
  king: Square | undefined;
  blockers: SquareSet;
  checkers: SquareSet;
  variantEnd: boolean;
  mustCapture: boolean;
}

export abstract class Position {
  board: Board;
  pockets: Material | undefined;
  turn: Color;
  castles: Castles;
  epSquare: Square | undefined;
  remainingChecks: RemainingChecks | undefined;
  halfmoves: number;
  fullmoves: number;

  protected constructor(readonly rules: Rules) {}

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

  protected setupUnchecked(setup: Setup) {
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

  kingAttackers(square: Square, attacker: Color, occupied: SquareSet): SquareSet {
    return attacksTo(square, attacker, this.board, occupied);
  }

  protected playCaptureAt(square: Square, captured: Piece): void {
    this.halfmoves = 0;
    if (captured.role === 'rook') this.castles.discardRook(square);
    if (this.pockets) this.pockets[opposite(captured.color)][captured.promoted ? 'pawn' : captured.role]++;
  }

ctx(): Context {
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
      if (!(0 <= sq && sq < 64)) continue;
      if (Math.abs(squareFile(sq) - squareFile(king)) !== step) continue;

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
    if (!b.moreThanOne()) blockers = blockers.union(b);
  }

  const checkers = this.kingAttackers(king, opposite(this.turn), this.board.occupied);

  return { king, blockers, checkers, variantEnd, mustCapture: false };
}


  clone(): Position {
    const pos = new (this as any).constructor();
    pos.board = this.board.clone();
    pos.pockets = this.pockets?.clone();
    pos.turn = this.turn;
    pos.castles = this.castles.clone();
    pos.epSquare = this.epSquare;
    pos.remainingChecks = this.remainingChecks?.clone();
    pos.halfmoves = this.halfmoves;
    pos.fullmoves = this.fullmoves;
    return pos;
  }

  protected validate(): Result<undefined, PositionError> {
    if (this.board.occupied.isEmpty()) return Result.err(new PositionError(IllegalSetup.Empty));
    if (this.board.king.size() !== 2) return Result.err(new PositionError(IllegalSetup.Kings));

    if (!defined(this.board.kingOf(this.turn))) return Result.err(new PositionError(IllegalSetup.Kings));

    const otherKing = this.board.kingOf(opposite(this.turn));
    if (!defined(otherKing)) return Result.err(new PositionError(IllegalSetup.Kings));
    if (this.kingAttackers(otherKing, this.turn, this.board.occupied).nonEmpty()) {
      return Result.err(new PositionError(IllegalSetup.OppositeCheck));
    }

    // allow pawns on back rank, since a wizard can teleport them there. 

/*     if (SquareSet.backranks().intersects(this.board.pawn)) {
      return Result.err(new PositionError(IllegalSetup.PawnsOnBackrank));
    } */


    return Result.ok(undefined);
  }

  dropDests(_ctx?: Context): SquareSet {
    return SquareSet.empty();
  }

  dests(square: Square, ctx?: Context): SquareSet {
    ctx = ctx || this.ctx();
    if (ctx.variantEnd) return SquareSet.empty();
    const piece = this.board.get(square);
    if (!piece || piece.color !== this.turn) return SquareSet.empty();

    // --- Snaring restriction ---
    let allSnareZones = SquareSet.empty();
    for (const [sq, bPiece] of this.board) {
      if (bPiece.role === 'snare' || bPiece.role === 'rollingsnare') {
        const zone = bPiece.role === 'snare'
          ? snareZone(this as unknown as Position, sq, bPiece.color)
          : rollingSnareZone(this as unknown as Position, sq, bPiece.color);

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

    let pseudo: SquareSet;
    let legal: SquareSet | undefined;

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
    } else if (piece.role === 'bishop') pseudo = bishopAttacks(square, this.board.occupied);
    else if (piece.role === 'knight') pseudo = knightAttacks(square);
    else if (piece.role === 'rook') pseudo = rookAttacks(square, this.board.occupied);
    else if (piece.role === 'queen') pseudo = queenAttacks(square, this.board.occupied);
    else if (piece.role === 'champion') pseudo = knightAttacks(square).xor(rookAttacks(square, this.board.occupied));
    else if (piece.role === 'princess') pseudo = bishopAttacks(square, this.board.occupied).xor(knightAttacks(square));
    else if (piece.role === 'amazon') pseudo = queenAttacks(square, this.board.occupied).xor(knightAttacks(square));
    else if (piece.role === 'mann') pseudo = mannAttacks(square);
    else if (piece.role === 'royalpainter') pseudo = royalpainterAttacks(square, this.board.occupied);
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
    else if (piece.role === 'wizard'){
      pseudo = wizardAttacks(square);
    }
    else if (piece.role == 'archer'){
      pseudo = archerAttacks(square, this.board.occupied);
    }
    else pseudo = kingAttacks(square);
  
    if (piece.role !== 'wizard'){
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
            if (this.simulateWizardMoveIsLegal(square, to, ctx)) allowed = allowed.with(to);
          }
          pseudo = allowed;
        } else {
          const checker = ctx.checkers.singleSquare();
          if (!defined(checker)) return SquareSet.empty();

          // If the checking piece is a sliding/sniper type then blocking is allowed.
          // Otherwise (leaper like knight/wizard/mann etc.) only captures of the checker
          // are legal (i.e. you cannot "block" a leaper).
          const checkerPiece = this.board.get(checker);
          if (!defined(checkerPiece)) return SquareSet.empty();

          const role = checkerPiece.role;
          const canBeBlocked = (
            role === 'rook' ||
            role === 'queen' ||
            role === 'bishop' ||
            role === 'champion' ||     // contains rook-like sliding part
            role === 'princess' ||     // contains bishop-like sliding part
            role === 'amazon' ||       // queen-like sliding part
            role === 'royalpainter' || // treated as sliding elsewhere
            role === 'archer'          // archer acted as a sniper in ctx()
          );

          if (canBeBlocked) {
            pseudo = pseudo.intersect(between(checker, ctx.king).with(checker));
          } else {
            // leaper / non-blockable: only allow moves that capture the checker
            pseudo = pseudo.intersect(SquareSet.fromSquare(checker));
          }
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
        } else if (piece.role === 'wizard'){
          // wizard pin exception logic
          let allowed = SquareSet.empty();
          for (const to of pseudo) {
            if (this.simulateWizardMoveIsLegal(square, to, ctx)) allowed = allowed.with(to);
          }
          pseudo = allowed;
        } else {
          pseudo = pseudo.intersect(ray(square, ctx.king));
        }
      }
      if (piece.role === 'wizard' && defined(ctx.king)) {
        let allowed = SquareSet.empty();
        for (const to of pseudo) {
          // simulateWizardMoveIsLegal must simulate the swap and re-evaluate king safety
          if (this.simulateWizardMoveIsLegal(square, to, ctx)) allowed = allowed.with(to);
        }
        pseudo = allowed;
      }
    }

    if (legal) pseudo = pseudo.union(legal);
    return pseudo;
  }

  isVariantEnd(): boolean {
    return false;
  }

  variantOutcome(_ctx?: Context): Outcome | undefined {
    return;
  }

hasInsufficientMaterial(color: Color): boolean {
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
  if (side.diff(this.board.king).isEmpty()) return true;

  // 3) If side's only non-king pieces are non-mating pieces and opponent only has king => insufficient
  if (side.diff(this.board.king).diff(nonMating).isEmpty() && opp.diff(this.board.king).isEmpty()) {
    return true;
  }

  // 4) Knights-only cases: (side has knights and nothing else but king) vs lone king => insufficient
  if (
    side.intersect(knights).nonEmpty() &&
    side.diff(this.board.king).diff(knights).isEmpty() &&
    opp.diff(this.board.king).isEmpty()
  ) {
    return true;
  }

  // 5) Bishops-only: check bishops belonging to side (use side.intersect on the board's bishop set)
  const sideBishops = side.intersect(bishopsSet);
  if (
    sideBishops.nonEmpty() &&
    side.diff(this.board.king).diff(bishopsSet).isEmpty() &&
    opp.diff(this.board.king).isEmpty()
  ) {
    const bishopsOnDark = sideBishops.intersects(SquareSet.darkSquares());
    const bishopsOnLight = sideBishops.intersects(SquareSet.lightSquares());
    const sameSquareColor = !(bishopsOnDark && bishopsOnLight); // true if bishops are NOT on both colors
    if (sameSquareColor) return true;
  }

  // otherwise sufficient material
  return false;
}

  // The following should be identical in all subclasses

  toSetup(): Setup {
    return {
      board: this.board.clone(),
      pockets: this.pockets?.clone(),
      turn: this.turn,
      castlingRights: this.castles.castlingRights,
      epSquare: legalEpSquare(this),
      remainingChecks: this.remainingChecks?.clone(),
      halfmoves: Math.min(this.halfmoves, 150),
      fullmoves: Math.min(Math.max(this.fullmoves, 1), 9999),
    };
  }

  isInsufficientMaterial(): boolean {
    return COLORS.every(color => this.hasInsufficientMaterial(color));
  }

  hasDests(ctx?: Context): boolean {
    ctx = ctx || this.ctx();
    for (const square of this.board[this.turn]) {
      if (this.dests(square, ctx).nonEmpty()) return true;
    }
    return this.dropDests(ctx).nonEmpty();
  }

isLegal(move: Move, ctx?: Context): boolean {
  if (isDrop(move)) {
    if (!this.pockets || this.pockets[this.turn][move.role] <= 0) return false;
    if ((move.role === 'pawn') && SquareSet.backranks().has(move.to)) return false;
    return this.dropDests(ctx).has(move.to);
  } else {
    // invalid promotion hints
    if (move.promotion === 'pawn') return false;
    if (move.promotion === 'king' && this.rules !== 'antichess') return false;

    // Helper info about the from/to squares and board pieces
    const targetPiece = this.board.get(move.to); // Piece | undefined
    const fromIsPawnLike = this.board.pawn.has(move.from) || (this.board.painter && this.board.painter.has(move.from)) || (this.board.snare && this.board.snare.has(move.from));
    const fromIsWizard = this.board.wizard && this.board.wizard.has(move.from);

    let willRequirePromotion = false;

    const fromRank = Math.floor(move.from / 8); 

    if (fromIsPawnLike) {
      // a pawn/painter/snare moving to the backrank => promotion required
      willRequirePromotion = SquareSet.backranks().has(move.to);
      //willRequirePromotion = true;
    } else if (fromIsWizard && targetPiece && (targetPiece.role === 'pawn' || targetPiece.role === 'painter' || targetPiece.role === 'snare') && targetPiece.color === this.turn && ((targetPiece.color === 'white' && fromRank === 7) || (targetPiece.color === 'black' && fromRank === 0))) {
      willRequirePromotion = SquareSet.backranks().has(move.from);
      //willRequirePromotion = true;
    } else {
      willRequirePromotion = false;
    }



    if (!!move.promotion !== willRequirePromotion) return false;
    const dests = this.dests(move.from, ctx);
    return dests.has(move.to) || dests.has(normalizeMove(this, move).to);
  }
}


  isCheck(): boolean {
    const king = this.board.kingOf(this.turn);
    return defined(king) && this.kingAttackers(king, opposite(this.turn), this.board.occupied).nonEmpty();
  }

  isEnd(ctx?: Context): boolean {
    if (ctx ? ctx.variantEnd : this.isVariantEnd()) return true;
    return this.isInsufficientMaterial() || !this.hasDests(ctx);
  }

  isCheckmate(ctx?: Context): boolean {
    ctx = ctx || this.ctx();
    return !ctx.variantEnd && ctx.checkers.nonEmpty() && !this.hasDests(ctx);
  }

  isStalemate(ctx?: Context): boolean {
    ctx = ctx || this.ctx();
    return !ctx.variantEnd && ctx.checkers.isEmpty() && !this.hasDests(ctx);
  }

  outcome(ctx?: Context): Outcome | undefined {
    const variantOutcome = this.variantOutcome(ctx);
    if (variantOutcome) return variantOutcome;
    ctx = ctx || this.ctx();
    if (this.isCheckmate(ctx)) return { winner: opposite(this.turn) };
    else if (this.isInsufficientMaterial() || this.isStalemate(ctx)) return { winner: undefined };
    else return;
  }

  allDests(ctx?: Context): Map<Square, SquareSet> {
    ctx = ctx || this.ctx();
    const d = new Map();
    if (ctx.variantEnd) return d;
    for (const square of this.board[this.turn]) {
      d.set(square, this.dests(square, ctx));
    }
    return d;
  }

play(move: Move): void {
  const turn = this.turn;
  const prevEp = this.epSquare;
  const castling = castlingSide(this, move);

  // Clear ephemeral state for this turn; will be set again if a double-step occurs
  this.epSquare = undefined;

  // Move clocks and turn flip (preserve original ordering)
  this.halfmoves += 1;
  if (turn === 'black') this.fullmoves += 1;
  this.turn = opposite(turn);

  if (isDrop(move)) {
    // dropping a piece from pocket
    this.board.set(move.to, { role: move.role, color: turn });
    if (this.pockets) this.pockets[turn][move.role]--;
    if (move.role === 'pawn') this.halfmoves = 0;
    return;
  }

  // Non-drop move
  const piece = this.board.take(move.from);
  if (!piece) return;

  // epCapture holds a piece already removed by en-passant (pawn capturing)
  let epCapture: Piece | undefined;

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
    if (capture) this.playCaptureAt(move.to, capture);

    // done
    if (!castling) return;
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
      if (defined(victim) && (victim.role === 'pawn' || victim.role === 'painter') && victim.color !== piece.color) {
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
    if (defined(dest) && dest.color !== piece.color) {
      // Paint the destination piece
      const painted = { role: dest.role, color: piece.color, promoted: dest.promoted };
      this.board.set(move.to, painted);

      // Painter stays where it started
      this.board.set(move.from, piece);

      // If we painted a rook, update castling rights
      if (dest.role === 'rook') this.castles.discardRook(move.to);

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
    if (capture) this.playCaptureAt(move.to, capture);

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
      if (defined(rookFrom)) {
        const rook = this.board.take(rookFrom);
        // move king to castled square
        this.board.set(kingCastlesTo(turn, castling), piece);
        if (rook) this.board.set(rookCastlesTo(turn, castling), rook);
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
    if (defined(destBefore)) {
      // snare cannot capture — do nothing
      return;
    }
    this.board.set(move.to, piece);

    // PGN/UI: if a capture flag existed, clear it (we didn't capture)
    if ((move as any).capture) (move as any).capture = false;
    return;
  }
  // --- Wizard: swaps with friendly piece, normal capture, or normal move ---
  else if (piece.role === 'wizard') {
    const destBefore = this.board.get(move.to);

    // 1) normal empty destination -> move
    if (!defined(destBefore)) {
      this.board.set(move.to, piece);
      return;
    }

    // 2) capture enemy -> normal capture
    if (destBefore.color !== turn) {
      const capture = this.board.set(move.to, piece) || undefined;
      if (capture) this.playCaptureAt(move.to, capture);
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
      if (
        (swappedPiece.role === 'pawn' || swappedPiece.role === 'painter' || swappedPiece.role === 'snare') &&
        SquareSet.backranks().has(move.from) &&
        move.promotion
      ) {
        swappedPiece.role = move.promotion;
        swappedPiece.promoted = !!this.pockets;
      }

      // perform swap
      this.board.set(move.to, piece);    // wizard -> destination
      this.board.set(move.from, swappedPiece); // swapped piece -> wizard origin

      // discard rook castling rights if the swapped piece was a rook
      if (swappedPiece.role === 'rook') this.castles.discardRook(move.to);
      return;
    }
  }
  // --- Archer special-case: ranged "hit" that leaves archer in place if long-range diagonal move ---
  else if (piece.role === 'archer') {
    const from = move.from;
    const to = move.to;
    const fileDelta = Math.abs(squareFile(to) - squareFile(from));
    const rankDelta = Math.abs(squareRank(to) - squareRank(from));
    const maxDelta = Math.max(fileDelta, rankDelta);

    // If it's a long-range diagonal (>1 and diagonal), archer hits but stays
    if (maxDelta > 1 && fileDelta === rankDelta) {
      const captured = this.board.take(to);
      // put the archer back on its original square
      this.board.set(from, piece);
      this.halfmoves = 0;
      if (captured) this.playCaptureAt(to, captured);
      return;
    }
  }

  // Generic case for remaining piece types: move normally (including handling epCapture set earlier)
  if (!castling) {
    const capture = this.board.set(move.to, piece) || epCapture;
    if (capture) this.playCaptureAt(move.to, capture);
  }

  // update remainingChecks if used by UI/conditions
  if (this.remainingChecks) {
    if (this.isCheck()) this.remainingChecks[turn] = Math.max(this.remainingChecks[turn] - 1, 0);
  }
}

  
private simulateWizardMoveIsLegal(from: Square, to: Square, ctx: Context): boolean {
  const color = this.turn;
  const opponent = opposite(color);
  const target = this.board.get(to);
  // Build a temp piece map from the current board
  const tempPieceMap = new Map<Square, Piece>();
  for (const [sq, p] of this.board) {
    // shallow copy to avoid mutating originals
    tempPieceMap.set(sq, { ...p });
  }
  const movingPiece = tempPieceMap.get(from);
  if (!movingPiece) return false; // no piece at `from`
  tempPieceMap.delete(from);

  if (!target) {
    // plain move
    const movedPiece = { ...movingPiece, square: to, moved: true } as Piece;
    tempPieceMap.set(to, movedPiece);
  } else if (target.color !== color) {
    // capture
    tempPieceMap.delete(to);
    const movedPiece = { ...movingPiece, square: to, moved: true } as Piece;
    tempPieceMap.set(to, movedPiece);
  } else {
    const swappedPiece = tempPieceMap.get(to)!;
    const newWizard  = { ...movingPiece,  square: to,   moved: true } as Piece;
    const newTarget  = { ...swappedPiece, square: from, moved: true } as Piece;

    tempPieceMap.set(to,   newWizard);
    tempPieceMap.set(from, newTarget);
  }
  // Build temp occupied from tempPieceMap
  let tempOccupied = SquareSet.empty();
  for (const sq of tempPieceMap.keys()) {
    tempOccupied = tempOccupied.union(SquareSet.fromSquare(sq));
  }
  // Locate king after applying the simulated move/swap
  let kingSq: Square | undefined;
  for (const [sq, p] of tempPieceMap) {
    if (p.role === 'king' && p.color === color) {
      kingSq = sq;
      break;
    }
  }
  if (kingSq === undefined) return false;
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
  private constructor() {
    super('chess');
  }

  static default(): Chess {
    const pos = new this();
    pos.reset();
    return pos;
  }

  static fromSetup(setup: Setup): Result<Chess, PositionError> {
    const pos = new this();
    pos.setupUnchecked(setup);
    return pos.validate().map(_ => pos);
  }

  clone(): Chess {
    return super.clone() as Chess;
  }
}

const validEpSquare = (pos: Position, square: Square | undefined): Square | undefined => {
  if (!defined(square)) return;
  const epRank = pos.turn === 'white' ? 5 : 2;
  const forward = pos.turn === 'white' ? 8 : -8;
  if (squareRank(square) !== epRank) return;
  if (pos.board.occupied.has(square + forward)) return;
  const pawn = square - forward;
  const target = pos.board.get(pawn);

  // Must be double-stepping pawn *or painter* of the opposite color
  if (!defined(target)) return;
  if (target.color !== opposite(pos.turn)) return;
  if (!(target.role === 'pawn' || target.role === 'painter')) return;

  return square;
};

const legalEpSquare = (pos: Position): Square | undefined => {
  if (!defined(pos.epSquare)) return;
  const ctx = pos.ctx();
  const ourEPers = pos.board.pieces(pos.turn, 'pawn')
    .union(pos.board.pieces(pos.turn, 'painter')); // painters move like pawns

  const candidates = ourEPers.intersect(
    pawnAttacks(opposite(pos.turn), pos.epSquare)
  );
    for (const candidate of candidates) {
    if (pos.dests(candidate, ctx).has(pos.epSquare)) return pos.epSquare;
  }
  return;
};

const canCaptureEp = (pos: Position, pawnFrom: Square, ctx: Context): boolean => {
  if (!defined(pos.epSquare)) return false;
  if (!pawnAttacks(pos.turn, pawnFrom).has(pos.epSquare)) return false;
  if (!defined(ctx.king)) return true;
  const delta = pos.turn === 'white' ? 8 : -8;
  const captured = pos.epSquare - delta;
  const victim = pos.board.get(captured);
  if (!victim || !(victim.role === 'pawn' || victim.role === 'painter')) return false;
  return pos
    .kingAttackers(
      ctx.king,
      opposite(pos.turn),
      pos.board.occupied.toggle(pawnFrom).toggle(captured).with(pos.epSquare),
    )
    .without(captured)
    .isEmpty();
};

const castlingDest = (pos: Position, side: CastlingSide, ctx: Context): SquareSet => {
  if (!defined(ctx.king) || ctx.checkers.nonEmpty()) return SquareSet.empty();
  const rook = pos.castles.rook[pos.turn][side];
  if (!defined(rook)) return SquareSet.empty();
  const rookPiece = pos.board.get(rook);
  if (!rookPiece || (rookPiece.role !== 'rook' && rookPiece.role !== 'champion')) return SquareSet.empty();
  if (pos.castles.path[pos.turn][side].intersects(pos.board.occupied)) return SquareSet.empty();

  const kingTo = kingCastlesTo(pos.turn, side);
  const kingPath = between(ctx.king, kingTo);
  const occ = pos.board.occupied.without(ctx.king);
  for (const sq of kingPath) {
    if (pos.kingAttackers(sq, opposite(pos.turn), occ).nonEmpty()) return SquareSet.empty();
  }

  const rookTo = rookCastlesTo(pos.turn, side);
  const after = pos.board.occupied.toggle(ctx.king).toggle(rook).toggle(rookTo);
  if (pos.kingAttackers(kingTo, opposite(pos.turn), after).nonEmpty()) return SquareSet.empty();

  return SquareSet.fromSquare(rook);
};

const snareZone = (pos: Position, square: Square, color: Color): SquareSet => {
  const front = color === 'white' ? square + 8 : square - 8;
  const left = square - 1;
  const right = square + 1;
  let zone = SquareSet.empty();
  if (0 <= front && front < 64) zone = zone.with(front);
  if (squareFile(left) === squareFile(square) - 1) zone = zone.with(left);
  if (squareFile(right) === squareFile(square) + 1) zone = zone.with(right);
  return zone;
};

function rollingSnareZone(pos: Position, sq: Square, color: Color): SquareSet {
  let zone = snareZone(pos, sq, color);
  const behindDelta = color === 'white' ? -8 : 8;
  const behind = sq + behindDelta;
  if (0 <= behind && behind < 64) {
    zone = zone.with(behind);
  }
  return zone;
}



export const pseudoDests = (pos: Position, square: Square, ctx: Context): SquareSet => {
  if (ctx.variantEnd) return SquareSet.empty();
  const piece = pos.board.get(square);
  if (!piece || piece.color !== pos.turn) return SquareSet.empty();

   // --- Snaring restriction ---
    let allSnareZones = SquareSet.empty();
    for (const [sq, bPiece] of pos.board) {
      if (bPiece.role === 'snare' || bPiece.role === 'rollingsnare') {
        const zone = bPiece.role === 'snare'
          ? snareZone(this as unknown as Position, sq, bPiece.color)
          : rollingSnareZone(this as unknown as Position, sq, bPiece.color);

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
  let pseudo: SquareSet;

  if (piece.role === 'pawn') {
    let captureTargets = pos.board[opposite(pos.turn)];
    if (defined(pos.epSquare)) captureTargets = captureTargets.with(pos.epSquare);
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
  } else if (piece.role === 'snare') {
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

  } else {
    pseudo = attacks(piece, square, pos.board.occupied);
    pseudo = pseudo.diff(pos.board[pos.turn]);
  }

  if (square === ctx.king) {
    return pseudo.union(castlingDest(pos, 'a', ctx)).union(castlingDest(pos, 'h', ctx));
  } else {
    return pseudo;
  }
};


export const equalsIgnoreMoves = (left: Position, right: Position): boolean =>
  left.rules === right.rules
  && boardEquals(left.board, right.board)
  && ((right.pockets && left.pockets?.equals(right.pockets)) || (!left.pockets && !right.pockets))
  && left.turn === right.turn
  && left.castles.castlingRights.equals(right.castles.castlingRights)
  && legalEpSquare(left) === legalEpSquare(right)
  && ((right.remainingChecks && left.remainingChecks?.equals(right.remainingChecks))
    || (!left.remainingChecks && !right.remainingChecks));

export const castlingSide = (pos: Position, move: Move): CastlingSide | undefined => {
  if (isDrop(move)) return;
  const delta = move.to - move.from;
  if (Math.abs(delta) !== 2 && !pos.board[pos.turn].has(move.to)) return;
  if (!pos.board.king.has(move.from)) return;
  return delta > 0 ? 'h' : 'a';
};

export const normalizeMove = (pos: Position, move: Move): Move => {
  const side = castlingSide(pos, move);
  if (!side) return move;
  const rookFrom = pos.castles.rook[pos.turn][side]; //bookmark
  return {
    from: (move as NormalMove).from,
    to: defined(rookFrom) ? rookFrom : move.to,
  };
};

export const isStandardMaterialSide = (board: Board, color: Color): boolean => {
  const promoted = Math.max(board.pieces(color, 'queen').size() - 1, 0)
    + Math.max(board.pieces(color, 'rook').size() - 2, 0)
    + Math.max(board.pieces(color, 'knight').size() - 2, 0)
    + Math.max(board.pieces(color, 'bishop').intersect(SquareSet.lightSquares()).size() - 1, 0)
    + Math.max(board.pieces(color, 'bishop').intersect(SquareSet.darkSquares()).size() - 1, 0);
  return board.pieces(color, 'pawn').size() + promoted <= 8;
};

export const isStandardMaterial = (pos: Chess): boolean =>
  COLORS.every(color => isStandardMaterialSide(pos.board, color));

export const isImpossibleCheck = (pos: Position): boolean => {
  const ourKing = pos.board.kingOf(pos.turn);
  if (!defined(ourKing)) return false;
  const checkers = pos.kingAttackers(ourKing, opposite(pos.turn), pos.board.occupied);
  if (checkers.isEmpty()) return false;
  if (defined(pos.epSquare)) {
    // The pushed pawn must be the only checker, or it has uncovered
    // check by a single sliding piece.
    const pushedTo = pos.epSquare ^ 8;
    const pushedFrom = pos.epSquare ^ 24;
    return (
      checkers.moreThanOne()
      || (checkers.first()! !== pushedTo
        && pos
          .kingAttackers(ourKing, opposite(pos.turn), pos.board.occupied.without(pushedTo).with(pushedFrom))
          .nonEmpty())
    );
  } else if (pos.rules === 'atomic') {
    // Other king moving away can cause many checks to be given at the same
    // time. Not checking details, or even that the king is close enough.
    return false;
  } else {
    // Sliding checkers aligned with king.
    return checkers.size() > 2 || (checkers.size() === 2 && ray(checkers.first()!, checkers.last()!).has(ourKing));
  }
};