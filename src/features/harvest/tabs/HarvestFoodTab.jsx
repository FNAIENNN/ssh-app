import FoodModule from '../../food/FoodModule';

/** Harvest → Food: dedicated canteen request flow for harvest crews. */
export default function HarvestFoodTab() {
  return <FoodModule source="harvest" />;
}
