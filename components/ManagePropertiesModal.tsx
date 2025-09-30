import React from 'react';
import { Player, Property, Space, SpaceType } from '@/types.ts';
import { Modal } from '../components/Modal.tsx';
import { PropertyCard } from '@/components/PropertyCard.tsx';

interface ManagePropertiesModalProps {
    player: Player;
    isReadOnly: boolean;
    board: (Space | Property)[];
    onClose: () => void;
    onMortgage: (propertyId: number) => void;
    onUnmortgage: (propertyId: number) => void;
    onBuyHouse: (propertyId: number) => void;
    onSellHouse: (propertyId: number) => void;
}

export const ManagePropertiesModal: React.FC<ManagePropertiesModalProps> = ({ player, isReadOnly, board, onClose, onMortgage, onUnmortgage, onBuyHouse, onSellHouse }) => {
    const ownedProperties = player.properties
        .map(propId => board.find(s => s.id === propId))
        .filter(p => p && 'price' in p) as Property[];

    const hasMonopoly = (property: Property) => {
        if (property.type !== SpaceType.PROPERTY) return false;
        const colorGroup = board.filter(s => (s as Property).color === property.color) as Property[];
        return colorGroup.every(p => p.ownerId === player.id && !p.mortgaged);
    };

    return (
        <Modal isOpen={true} title={`${player.name}'s Assets`} onClose={onClose}>
            <div className="space-y-4 max-h-[70vh] overflow-y-auto p-1">
                {ownedProperties.length > 0 ? (
                    ownedProperties.map(prop => {
                        const canBuyHouses = hasMonopoly(prop);
                        const unmortgageCost = Math.floor(prop.price / 2 * 1.1);
                        const houseSalePrice = prop.houseCost / 2;

                        return (
                            <PropertyCard key={prop.id} property={prop}>
                                {!isReadOnly && (
                                     <div className="grid grid-cols-2 gap-2 mt-2">
                                        {/* --- MORTGAGE/UNMORTGAGE BUTTON --- */}
                                        {prop.mortgaged ? (
                                            <button 
                                                onClick={() => onUnmortgage(prop.id)}
                                                disabled={player.money < unmortgageCost}
                                                className="bg-green-500 text-white px-3 py-1 text-sm rounded w-full disabled:bg-gray-400"
                                            >
                                                Unmortgage (${unmortgageCost})
                                            </button>
                                        ) : (
                                            <button 
                                                onClick={() => onMortgage(prop.id)} 
                                                disabled={prop.houses > 0}
                                                className="bg-yellow-600 text-white px-3 py-1 text-sm rounded w-full disabled:bg-gray-400"
                                                title={prop.houses > 0 ? "Sell houses first" : `Mortgage for $${prop.price/2}`}
                                            >
                                                Mortgage (${prop.price/2})
                                            </button>
                                        )}

                                        {/* --- BUY/SELL HOUSE BUTTONS --- */}
                                        {prop.type === SpaceType.PROPERTY ? (
                                            <div className="flex flex-col space-y-1">
                                                <button 
                                                    onClick={() => onBuyHouse(prop.id)}
                                                    disabled={!canBuyHouses || prop.houses >= 5 || player.money < prop.houseCost}
                                                    className="bg-blue-500 text-white px-2 py-1 text-xs rounded disabled:bg-gray-400"
                                                    title={!canBuyHouses ? "You need the full color set to build" : ""}
                                                >
                                                    {prop.houses < 4 ? 'Buy House' : 'Buy Hotel'} (${prop.houseCost})
                                                </button>
                                                <button 
                                                    onClick={() => onSellHouse(prop.id)}
                                                    disabled={prop.houses <= 0}
                                                    className="bg-red-500 text-white px-2 py-1 text-xs rounded disabled:bg-gray-400"
                                                >
                                                    Sell {prop.houses === 5 ? 'Hotel' : 'House'} (${houseSalePrice})
                                                </button>
                                            </div>
                                        ) : <div />}
                                    </div>
                                )}
                            </PropertyCard>
                        )
                    })
                ) : (
                    <p className="text-center text-gray-500">This player does not own any properties.</p>
                )}
            </div>
        </Modal>
    );
};