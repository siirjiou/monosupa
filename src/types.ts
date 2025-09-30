export enum SpaceType {
  PROPERTY,
  RAILROAD,
  UTILITY,
  CHANCE,
  COMMUNITY_CHEST,
  TAX,
  GO,
  JAIL,
  FREE_PARKING,
  GO_TO_JAIL,
}

export interface Space {
  id: number;
  name: string;
  type: SpaceType;
}

export interface Property extends Space {
  price: number;
  rent: number[];
  houseCost: number;
  color: string;
  ownerId?: number;
  houses: number;
  mortgaged: boolean;
}

export interface Player {
  id: number;
  name: string;
  money: number;
  position: number;
  properties: number[];
  isJailed: boolean;
  jailTurns: number;
  tokenColor: string;
  tokenHex: string;
  tokenIcon: string;
  getOutOfJailFreeCards: number;
  lastGained: number;
  lastPaid: number;
  isBankrupt: boolean;
  tradeCount: number;
}

export enum GamePhase {
  SETUP,
  LOBBY,
  PLAYER_TURN,
  GAME_OVER,
}

export enum PendingActionType {
  AWAIT_PURCHASE = 'AWAIT_PURCHASE',
  AWAIT_TRADE_RESPONSE = 'AWAIT_TRADE_RESPONSE',
  AWAIT_JAIL_DECISION = 'AWAIT_JAIL_DECISION',
  AWAIT_DEBT_RESOLUTION = 'AWAIT_DEBT_RESOLUTION',
  AWAIT_CARD_ACKNOWLEDGEMENT = 'AWAIT_CARD_ACKNOWLEDGEMENT',
}

export type PendingAction = 
 | { type: PendingActionType.AWAIT_PURCHASE, playerId: number, propertyId: number }
 | { type: PendingActionType.AWAIT_TRADE_RESPONSE, playerId: number, tradeOffer: TradeOffer }
 | { type: PendingActionType.AWAIT_CARD_ACKNOWLEDGEMENT, playerId: number, card: CardEffect }
 | { type: PendingActionType.AWAIT_JAIL_DECISION, playerId: number }
 | { type: PendingActionType.AWAIT_DEBT_RESOLUTION, playerId: number, amountOwed: number, owedToPlayerId: number | 'bank' };


export interface GameState {
  id: string;
  hostId: number;
  phase: GamePhase;
  players: Player[];
  board: (Space | Property)[];
  currentPlayerIndex: number;
  dice: [number, number];
  gameLog: string[];
  doublesCount: number;
  hasRolled: boolean;
  pendingAction: PendingAction | null;
}

export interface TradeOffer {
  fromPlayerId: number;
  toPlayerId: number;
  offer: {
    money: number;
    properties: number[];
  };
  request: {
    money: number;
    properties: number[];
  };
}

export enum CardType {
  CHANCE = 'Chance',
  COMMUNITY_CHEST = 'Community Chest',
}

export enum CardAction {
  PAY_MONEY = 'PAY_MONEY',
  RECEIVE_MONEY = 'RECEIVE_MONEY',
  MOVE_TO = 'MOVE_TO',
  MOVE_BY = 'MOVE_BY',
  GO_TO_JAIL = 'GO_TO_JAIL',
  GET_OUT_OF_JAIL_FREE = 'GET_OUT_OF_JAIL_FREE',
  PAY_FOR_BUILDINGS = 'PAY_FOR_BUILDINGS',
  RECEIVE_FROM_PLAYERS = 'RECEIVE_FROM_PLAYERS',
}

export interface CardEffect {
    action: CardAction;
    amount?: number;
    spaceId?: number;
    text: string;
    buildingCosts?: {
        perHouse: number;
        perHotel: number;
    }
}

export type GameAction = { playerId: number } & (
  | { type: 'START_GAME' }
  | { type: 'ROLL_DICE' }
  | { type: 'BUY_PROPERTY' }
  | { type: 'DECLINE_PROPERTY' }
  | { type: 'END_TURN' }
  | { type: 'ACKNOWLEDGE_CARD' }
  | { type: 'PROPOSE_TRADE', tradeOffer: TradeOffer }
  | { type: 'RESPOND_TO_TRADE', tradeOffer: TradeOffer, accepted: boolean }
  | { type: 'MORTGAGE_PROPERTY', propertyId: number }
  | { type: 'UNMORTGAGE_PROPERTY', propertyId: number }
  | { type: 'BUY_HOUSE', propertyId: number }
  | { type: 'SELL_HOUSE', propertyId: number }
  | { type: 'PAY_JAIL_FINE' }
  | { type: 'USE_JAIL_CARD' }
  | { type: 'ATTEMPT_JAIL_ROLL' }
  | { type: 'RESOLVE_DEBT' }
  | { type: 'DECLARE_BANKRUPTCY' }
);