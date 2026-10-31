/** Published category-V UOV Table 6 example, not this browser's parameters. */
export const UOV_COST = { baseline:1486775, offline:1460168, online:23133, bytes:9504 } as const;
export function precomputationCosts(count: number) {
  if(!Number.isInteger(count)||count<0||count>1000)throw new Error('Use 0–1000 items');
  return {offline:count*UOV_COST.offline,online:count*UOV_COST.online,total:count*(UOV_COST.offline+UOV_COST.online),bytes:count*UOV_COST.bytes,
    onlineSpeedup:UOV_COST.baseline/UOV_COST.online,totalSpeedup:UOV_COST.baseline/(UOV_COST.offline+UOV_COST.online)};
}
/** Lifecycle only. No UOV secret matrix, signature or browser benchmark. */
export class PrecomputationInventory {
  private items=new Map<number,boolean>();
  reserve(): number {const id=this.items.size+1;this.items.set(id,false);return id;}
  consume(id: number): void {
    if(!this.items.has(id)||this.items.get(id))throw new Error('Missing or already consumed secret-state item');
    this.items.set(id,true);
  }
  metadata(){return [...this.items].map(([id,consumed])=>({id,consumed}));}
}

export function buildPrecomputationPanel(): HTMLElement {
  const panel=document.createElement('section');panel.className='section';
  panel.setAttribute('aria-labelledby','precomputation-heading');
  panel.innerHTML=`<h2 id="precomputation-heading">Precomputation moves the work</h2>
    <p>Our signing path samples fresh vinegar values and solves per call. This separate lifecycle model uses the historical category-V UOV example in Table 6 of <a href="https://doi.org/10.46586/tches.v2022.i1.245-269" target="_blank" rel="noopener noreferrer">Efficient Implementations of Rainbow and UOV using AVX2</a>, pp. 14–21, especially p. 17. Its denominator is the paper's 1,486,775-cycle baseline on its AVX2 platform; these are published cycles, not browser measurements or recommended parameters.</p>
    <label for="precompute-count">Number of signatures to budget (1–1000)</label><input id="precompute-count" type="number" min="1" max="1000" value="1">
    <p id="precompute-costs" role="status"></p>
    <button type="button" class="action-button" id="precompute-reserve">Reserve modeled one-use item</button>
    <label for="precompute-item">Public inventory ID</label><select id="precompute-item" aria-label="Public inventory ID"></select>
    <button type="button" class="ghost-button" id="precompute-spend">Consume selected item</button><p id="precompute-status" role="status">No items reserved.</p>
    <p>Only public lifecycle metadata (ID and consumed status) appears here. Real precomputation also holds sensitive secret state; this model does not generate or display a UOV matrix. Consumed items cannot be reused. Reserve/consume does not accelerate the live signing engine.</p>
    <p>Leakage and reuse attacks require enough tuples and the relevant rank conditions. An equivalent signing key need not have the original key bytes. Do not transplant Rainbow or these historical security parameters; see <a href="https://nvlpubs.nist.gov/nistpubs/ir/2022/NIST.IR.8413-upd1.pdf" target="_blank" rel="noopener noreferrer">NIST IR 8413 update 1 §4.5.3</a>. Compare the existing secret-triple <a href="https://systemslibrarian.github.io/crypto-lab-spdz-forge/">bank/spend/reuse lesson in SPDZ Forge</a>.</p>`;
  const input=panel.querySelector<HTMLInputElement>('#precompute-count')!;
  const costs=panel.querySelector('#precompute-costs')!;
  function update(){try{const c=precomputationCosts(Number(input.value));costs.textContent=`Offline ${c.offline.toLocaleString()} + online ${c.online.toLocaleString()} = total ${c.total.toLocaleString()} cycles. Inventory ${c.bytes.toLocaleString()} bytes. Online-latency speedup ${c.onlineSpeedup.toFixed(2)}×; total-work speedup ${c.totalSpeedup.toFixed(4)}×.`;}catch(e){costs.textContent=String(e);}}
  input.addEventListener('input',update);update();
  const inventory=new PrecomputationInventory(), select=panel.querySelector<HTMLSelectElement>('#precompute-item')!, status=panel.querySelector('#precompute-status')!;
  panel.querySelector('#precompute-reserve')!.addEventListener('click',()=>{
    const id=inventory.reserve(),option=document.createElement('option');option.value=String(id);option.textContent=`${id}: available`;select.append(option);select.value=String(id);status.textContent=`Modeled item ${id} reserved. No signature generated.`;
  });
  panel.querySelector('#precompute-spend')!.addEventListener('click',()=>{
    try{const id=Number(select.value);inventory.consume(id);select.selectedOptions[0].textContent=`${id}: consumed`;status.textContent=`Item ${id} consumed; a second use is refused.`;}catch(e){status.textContent=String(e);}
  });
  return panel;
}
