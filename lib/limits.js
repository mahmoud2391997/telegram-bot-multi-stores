export function limit(name,fallback,max=1000) {
  const value=Number(process.env[name]);
  return Number.isSafeInteger(value)&&value>0?Math.min(value,max):fallback;
}
export const channelLimit=()=>limit('MAX_CHANNELS',100);
export const sectionLimit=()=>limit('MAX_SECTIONS',50);
export const postLogLimit=()=>limit('POST_LOG_LIMIT',12,128);
export const updateLogLimit=()=>limit('UPDATE_LOG_LIMIT',16,128);
export const attemptLogLimit=()=>limit('ATTEMPT_LOG_LIMIT',12,128);
