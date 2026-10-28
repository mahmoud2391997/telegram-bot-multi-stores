import {AsyncLocalStorage} from 'node:async_hooks';
const scope=new AsyncLocalStorage();
export const remaining=()=>Math.max(0,(scope.getStore()?.deadline ?? Date.now()+90000)-Date.now());
export const withBudget=(work,ms=90000)=>scope.run({deadline:Date.now()+ms},work);
export const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
export async function retryQuick(work,{retryable,delay=()=>250,maxRetries=2,reserve=10000,wait=sleep,left=remaining}={}) {
  for(let attempt=0;;attempt++) {
    try {return await work();}
    catch(error) {
      const pause=delay(error,attempt);
      if(attempt>=maxRetries || !retryable(error) || !Number.isFinite(pause) || pause<0 || pause+reserve>=left()) throw error;
      await wait(pause);
    }
  }
}
