from __future__ import annotations
import copy,json,subprocess,sys,tempfile,unittest
from datetime import datetime,timedelta,timezone
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
import auto_heal_update as heal
ROOT=Path(__file__).resolve().parents[1]

class RequiredSourceCoverageTests(unittest.TestCase):
    def setUp(self):
        self.now=datetime.now(timezone.utc)
        self.rules=json.loads((ROOT/'.github/autoheal/rules.json').read_text())
        self.observer={'source_revision':'a'*64,'pending_source_count':0,'lease_until':0,
          'source_observation':{'source_revision':'a'*64,'checked_at':self.now.isoformat(),'source_error_count':0},
          'eauction_observation':{'enabled':True,'checked_at':self.now.isoformat(),'sources_observed':3}}
    def classify(self,observer,*,verified=True,log=''):
        return heal.classify(log,{'status':'current'},self.rules,observer=observer,
          observer_verified=verified,now=self.now,require_source_coverage=True)
    def test_only_complete_current_verified_coverage_is_current(self):
        result=self.classify(self.observer)
        self.assertEqual((result['classification'],result['action']),('production_current','no_op'))
        for observer,verified in [(None,False),(self.observer,False),({},True)]:
            with self.subTest(observer=observer,verified=verified):
                result=self.classify(observer,verified=verified)
                self.assertEqual((result['status'],result['action']),('blocked','alert_human'))
    def test_disabled_missing_stale_failed_and_mismatched_sources_never_become_current(self):
        mutations=[lambda o:o['eauction_observation'].update(enabled=False),
          lambda o:o.pop('eauction_observation'),lambda o:o['eauction_observation'].update(sources_observed=0),
          lambda o:o['eauction_observation'].update(checked_at=(self.now-timedelta(hours=9)).isoformat()),
          lambda o:o['source_observation'].update(source_error_count=1),
          lambda o:o['source_observation'].pop('source_error_count'),
          lambda o:o['source_observation'].update(source_error_count='0'),
          lambda o:o['source_observation'].update(source_revision='b'*64),
          lambda o:o['source_observation'].update(checked_at=(self.now-timedelta(hours=2)).isoformat()),
          lambda o:o['source_observation'].update(checked_at=(self.now+timedelta(hours=1)).isoformat()),
          lambda o:o.pop('source_observation'),lambda o:o.pop('pending_source_count'),
          lambda o:o.update(lease_until='unknown')]
        for index,mutate in enumerate(mutations):
            with self.subTest(case=index):
                observer=copy.deepcopy(self.observer);mutate(observer);result=self.classify(observer)
                self.assertEqual((result['status'],result['action']),('blocked','alert_human'))
                self.assertFalse(result['deploy_required']);self.assertFalse(result['llm_escalation_required'])
    def test_pending_or_active_publication_is_not_current_and_does_not_mask_failures(self):
        self.observer['pending_source_count']=1
        self.assertEqual(self.classify(self.observer)['classification'],'source_publication_pending')
        self.observer['lease_until']=int(self.now.timestamp())+600
        self.assertEqual(self.classify(self.observer)['classification'],'source_publication_in_progress')
        for log in ['SOURCE_PARSE_UNVERIFIED','Set the CLOUDFLARE_API_TOKEN','FAIL: test_guard (test.Guard)']:
            self.assertNotEqual(self.classify(self.observer,log=log)['action'],'no_op')
    def test_production_workflow_and_cli_require_source_evidence(self):
        self.assertIn('--require-source-coverage',(ROOT/'.github/workflows/auto-heal.yml').read_text())
        self.observer['source_observation']['source_error_count']=2
        with tempfile.TemporaryDirectory() as directory:
            path=Path(directory)
            (path/'freshness.json').write_text(json.dumps({'status':'current'}))
            (path/'observer.json').write_text(json.dumps(self.observer))
            subprocess.run([sys.executable,str(ROOT/'scripts/auto_heal_update.py'),'classify',
              '--freshness-json',str(path/'freshness.json'),'--observer-json',str(path/'observer.json'),
              '--observer-verified','true','--require-source-coverage','--output',str(path/'plan.json')],
              check=True,capture_output=True,text=True)
            self.assertEqual(json.loads((path/'plan.json').read_text())['action'],'alert_human')
