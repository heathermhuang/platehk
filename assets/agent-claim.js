(() => {
  const element = id => document.getElementById(id);
  const status = element('status');
  element('claim-form').addEventListener('submit', async event => {
    event.preventDefault();
    element('claim-button').disabled = true;
    status.textContent = '處理中… / Processing…';
    try {
      const response = await fetch('/api/agent/claim', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ claim_token: element('claim-token').value.trim() }) });
      if (!response.ok) throw new Error('claim_failed');
      const result = await response.json();
      element('claim-token').value = '';
      element('claim-form').hidden = true;
      element('management').hidden = false;
      element('registration').textContent = `${result.registration_id} · ${result.scope} · ${result.expires_at}`;
      element('management-token').value = result.management_token;
      element('revoke-token').value = result.management_token;
      status.textContent = '已接管。你現在可以撤銷這個代理程式的存取權限。 / You now control revocation for this registration.';
    } catch {
      status.textContent = '接管失敗：接管碼可能無效、已使用或已過期。 / Could not claim: the token may be invalid, already used, or expired.';
    } finally { element('claim-button').disabled = false; }
  });
  element('revoke-form').addEventListener('submit', async event => {
    event.preventDefault();
    element('revoke-button').disabled = true;
    try {
      const token = element('revoke-token').value.trim();
      if (!/^ph[km]_reg_[a-f0-9]{32}\.[a-f0-9]{64}$/.test(token)) throw new Error('invalid_token');
      const response = await fetch('/api/agent/revoke', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ token }) });
      if (!response.ok) throw new Error('revoke_failed');
      element('revoke-token').value = '';
      element('management-token').value = '';
      status.textContent = '撤銷要求已完成；有效憑證已停用，無效或已撤銷的憑證不會另行披露。 / Revocation processed. Any active matching credential is now disabled.';
    } catch { status.textContent = '未能撤銷，請核對憑證後重試。 / Could not revoke; check the credential and retry.'; }
    finally { element('revoke-button').disabled = false; }
  });
})();
