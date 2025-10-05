import React, { useMemo } from 'react';
import { Player, Property, Space } from '@/types.ts';
import { PropertyCard } from '@/components/PropertyCard.tsx';

interface TradeModalProps {
  currentPlayer: Player;
  targetPlayer: Player;
  board: (Space | Property)[];
  isCounterOffer?: boolean;
  onClose: () => void;
  onPropose: (tradeDetails: {
    fromPlayerId: number;
    toPlayerId: number;
    offer: { money: number; properties: number[] };
    request: { money: number; properties: number[] };
  }) => void;
  /** optional countdown shown when composing a counter */
  secondsLeft?: number;
}

export const TradeModal: React.FC<TradeModalProps> = ({
  currentPlayer,
  targetPlayer,
  board,
  isCounterOffer = false,
  onClose,
  onPropose,
  secondsLeft
}) => {
  const currentProps = useMemo(
    () => currentPlayer.properties.map(id => board[id]).filter(Boolean) as Property[],
    [currentPlayer, board]
  );
  const targetProps = useMemo(
    () => targetPlayer.properties.map(id => board[id]).filter(Boolean) as Property[],
    [targetPlayer, board]
  );

  const [offerMoney, setOfferMoney] = React.useState(0);
  const [requestMoney, setRequestMoney] = React.useState(0);
  const [offerProps, setOfferProps] = React.useState<number[]>([]);
  const [requestProps, setRequestProps] = React.useState<number[]>([]);

  const toggleOfferProp = (id: number) =>
    setOfferProps(prev => (prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]));
  const toggleRequestProp = (id: number) =>
    setRequestProps(prev => (prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]));

  const submit = () => {
    onPropose({
      fromPlayerId: currentPlayer.id,
      toPlayerId: targetPlayer.id,
      offer: { money: Math.max(0, Math.floor(offerMoney)), properties: offerProps },
      request: { money: Math.max(0, Math.floor(requestMoney)), properties: requestProps }
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-bold">
          {isCounterOffer ? 'Counter Offer' : 'Propose Trade'} to {targetPlayer.name}
        </h3>
        {typeof secondsLeft === 'number' && (
          <div className="text-sm text-gray-600">Time left: <span className="font-semibold">{secondsLeft}s</span></div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* You Give */}
        <div className="border rounded p-2">
          <h4 className="font-semibold mb-2">You Give</h4>
          <label className="block text-sm mb-2">
            Cash:
            <input
              type="number"
              min={0}
              value={offerMoney}
              onChange={e => setOfferMoney(parseInt(e.target.value || '0', 10))}
              className="ml-2 p-1 border rounded w-28"
            />
          </label>
          <div className="space-y-1 max-h-40 overflow-y-auto">
            {currentProps.map(p => (
              <label key={p.id} className="flex items-center space-x-2">
                <input type="checkbox" checked={offerProps.includes(p.id)} onChange={() => toggleOfferProp(p.id)} />
                <PropertyCard property={p} compact />
              </label>
            ))}
          </div>
        </div>

        {/* You Get */}
        <div className="border rounded p-2">
          <h4 className="font-semibold mb-2">You Get</h4>
          <label className="block text-sm mb-2">
            Cash:
            <input
              type="number"
              min={0}
              value={requestMoney}
              onChange={e => setRequestMoney(parseInt(e.target.value || '0', 10))}
              className="ml-2 p-1 border rounded w-28"
            />
          </label>
          <div className="space-y-1 max-h-40 overflow-y-auto">
            {targetProps.map(p => (
              <label key={p.id} className="flex items-center space-x-2">
                <input type="checkbox" checked={requestProps.includes(p.id)} onChange={() => toggleRequestProp(p.id)} />
                <PropertyCard property={p} compact />
              </label>
            ))}
          </div>
        </div>
      </div>

      <div className="flex justify-end space-x-2">
        <button onClick={onClose} className="px-4 py-2 rounded bg-gray-300">Cancel</button>
        <button onClick={submit} className="px-4 py-2 rounded bg-blue-600 text-white font-bold">Send</button>
      </div>
    </div>
  );
};

export default TradeModal;
