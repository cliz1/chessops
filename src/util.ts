import {
  CastlingSide,
  Color,
  FILE_NAMES,
  isDrop,
  isNormal,
  type LowerCaseRoleChar,
  Move,
  RANK_NAMES,
  Role,
  type RoleChar,
  Square,
  SquareName,
} from './types.js';

export const defined = <A>(v: A | undefined): v is A => v !== undefined;

export const opposite = (color: Color): Color => (color === 'white' ? 'black' : 'white');

export const squareRank = (square: Square): number => square >> 3;

export const squareFile = (square: Square): number => square & 0x7;

export const squareFromCoords = (file: number, rank: number): Square | undefined =>
  0 <= file && file < 8 && 0 <= rank && rank < 8 ? file + 8 * rank : undefined;

export const roleToChar = (role: Role): LowerCaseRoleChar => {
  switch (role) {
    case 'pawn':
      return 'p';
    case 'knight':
      return 'n';
    case 'bishop':
      return 'b';
    case 'rook':
      return 'r';
    case 'queen':
      return 'q';
    case 'king':
      return 'k';
    case 'champion':
      return 'c';
    case 'princess':
      return 'i';
    case 'amazon':
      return 'a';
    case 'commoner':
      return 'm';
    case 'painter':
      return 'y';
    case 'snare':
      return 's';
    case 'wizard':
      return 'w';
    case 'archer':
      return 'x';
    case 'royalpainter':
      return 'o';
    case 'rollingsnare':
      return 'l';
  }
};

export function charToRole(ch: RoleChar): Role;
export function charToRole(ch: string): Role | undefined;
export function charToRole(ch: string): Role | undefined {
  switch (ch.toLowerCase()) {
    case 'p':
      return 'pawn';
    case 'n':
      return 'knight';
    case 'b':
      return 'bishop';
    case 'r':
      return 'rook';
    case 'q':
      return 'queen';
    case 'k':
      return 'king';
    case 'c':
      return 'champion';
    case 'i':
      return 'princess';
    case 'a':
      return 'amazon';
    case 'm':
      return 'commoner';
    case 'y':
      return 'painter';
    case 's':
      return 'snare';
    case 'w':
      return 'wizard';
    case 'x':
      return 'archer';
    case 'o':
      return 'royalpainter';
    case 'l':
      return 'rollingsnare';
    default:
      return;
  }
}

export function parseSquare(str: SquareName): Square;
export function parseSquare(str: string): Square | undefined;
export function parseSquare(str: string): Square | undefined {
  if (str.length !== 2) return;
  return squareFromCoords(str.charCodeAt(0) - 'a'.charCodeAt(0), str.charCodeAt(1) - '1'.charCodeAt(0));
}

export const makeSquare = (square: Square): SquareName =>
  (FILE_NAMES[squareFile(square)] + RANK_NAMES[squareRank(square)]) as SquareName;

export const parseUci = (str: string): Move | undefined => {
  if (str[1] === '@' && str.length === 4) {
    const role = charToRole(str[0]);
    const to = parseSquare(str.slice(2));
    if (role && defined(to)) return { role, to };
  } else if (str.length === 4 || str.length === 5) {
    const from = parseSquare(str.slice(0, 2));
    const to = parseSquare(str.slice(2, 4));
    let promotion: Role | undefined;
    if (str.length === 5) {
      promotion = charToRole(str[4]);
      if (!promotion) return;
    }
    if (defined(from) && defined(to)) return { from, to, promotion };
  }
  return;
};

export const moveEquals = (left: Move, right: Move): boolean => {
  if (left.to !== right.to) return false;
  if (isDrop(left)) return isDrop(right) && left.role === right.role;
  else return isNormal(right) && left.from === right.from && left.promotion === right.promotion;
};

/**
 * Converts a move to UCI notation, like `g1f3` for a normal move,
 * `a7a8q` for promotion to a queen, and `Q@f7` for a Crazyhouse drop.
 */
export const makeUci = (move: Move): string =>
  isDrop(move)
    ? `${roleToChar(move.role).toUpperCase()}@${makeSquare(move.to)}`
    : makeSquare(move.from) + makeSquare(move.to) + (move.promotion ? roleToChar(move.promotion) : '');

export const kingCastlesTo = (color: Color, side: CastlingSide): Square =>
  color === 'white' ? (side === 'a' ? 2 : 6) : side === 'a' ? 58 : 62;

export const rookCastlesTo = (color: Color, side: CastlingSide): Square =>
  color === 'white' ? (side === 'a' ? 3 : 5) : side === 'a' ? 59 : 61;
