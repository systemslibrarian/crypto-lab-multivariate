import {it,expect} from 'vitest';
import {UOV_COST,precomputationCosts,PrecomputationInventory} from './precomputation';
it('adds offline and online work with the published denominator',()=>{
 expect(UOV_COST.offline+UOV_COST.online).toBe(1483301);
 expect(precomputationCosts(2)).toMatchObject({total:2966602,bytes:19008});
 expect(precomputationCosts(1).onlineSpeedup).toBeGreaterThan(64);
 expect(precomputationCosts(1).totalSpeedup).toBeLessThan(1.01);
 expect(()=>precomputationCosts(NaN)).toThrow();
});
it('rejects reuse and exposes only public lifecycle metadata',()=>{
 const bank=new PrecomputationInventory(),id=bank.reserve();bank.consume(id);
 expect(()=>bank.consume(id)).toThrow();expect(()=>bank.consume(999)).toThrow();
 expect(bank.metadata()).toEqual([{id:1,consumed:true}]);
});
