"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RULES = exports.isNormal = exports.isDrop = exports.CASTLING_SIDES = exports.ROLES = exports.COLORS = exports.ROLE_CHARS = exports.RANK_NAMES = exports.FILE_NAMES = void 0;
exports.FILE_NAMES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
exports.RANK_NAMES = ['1', '2', '3', '4', '5', '6', '7', '8'];
exports.ROLE_CHARS = ['q', 'n', 'r', 'b', 'p', 'k', 'c', 'i', 'a', 'm', 'y', 's', 'w', 'x', 'o', 'l'];
exports.COLORS = ['white', 'black'];
exports.ROLES = ['pawn', 'knight', 'bishop', 'rook', 'queen', 'king', 'champion', 'princess', 'amazon', 'commoner', 'painter', 'snare', 'wizard', 'archer', 'royalpainter', 'rollingsnare'];
exports.CASTLING_SIDES = ['a', 'h'];
const isDrop = (v) => 'role' in v;
exports.isDrop = isDrop;
const isNormal = (v) => 'from' in v;
exports.isNormal = isNormal;
exports.RULES = [
    'chess',
    'antichess',
    'kingofthehill',
    '3check',
    'atomic',
    'horde',
    'racingkings',
    'crazyhouse',
];
//# sourceMappingURL=types.js.map