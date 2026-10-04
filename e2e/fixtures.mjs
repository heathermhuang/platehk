import {test as base, expect} from '@playwright/test';
import {createHash} from 'node:crypto';

function localVisitor(testInfo) {
  const id=createHash('sha256').update(testInfo.project.name+'\0'+testInfo.testId).digest('hex');
  return `2001:db8:${id.slice(0,4)}:${id.slice(4,8)}::1`;
}

export const test=base.extend({
  context:async({context,baseURL},use,testInfo)=>{
    if(!process.env.E2E_BASE_URL) {
      const origin=new URL(baseURL).origin;
      await context.route(`${origin}/**`,route=>route.continue({headers:{...route.request().headers(),'cf-connecting-ip':localVisitor(testInfo)}}));
    }
    await use(context);
  },
  request:async({request,playwright,baseURL},use,testInfo)=>{
    if(process.env.E2E_BASE_URL) {await use(request);return;}
    const isolated=await playwright.request.newContext({baseURL,extraHTTPHeaders:{'cf-connecting-ip':localVisitor(testInfo)}});
    try {await use(isolated);} finally {await isolated.dispose();}
  },
});
export {expect};
