/* Local, fictional product previews. Selecting a workflow makes no requests. */
(() => {
  const product = document.querySelector('.zapier-product');
  if (!product) return;
  const icon = (kind) => {
    if (kind === 'alive5') return '<img src="../assets/images/alive5-logo.png" alt="" />';
    const paths = {
      calendar: '<rect x="4" y="5" width="16" height="16" rx="3"/><path d="M8 3v4m8-4v4M4 11h16m-11 4h2m2 0h2m-6 3h2"/>',
      sheets: '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M8 8h8M8 12h8m-8 4h8M12 8v8"/>',
      slack: '<path d="M7 3v12m4-12v18m4-18v18m4-12v12M3 7h12M3 11h18M3 15h18m-12 4h12"/>',
    };
    return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round">${paths[kind]}</svg>`;
  };
  const examples = {
    reminder: {
      trigger: ['calendar', 'Google Calendar', 'Event Start'],
      action: ['alive5', 'Alive5', 'Send SMS'],
      label: 'Appointment reminder',
      message: 'Hi Alex, a quick reminder that your appointment is tomorrow at 10:00 AM. See you then!',
      footer: 'From your business number',
      path: 'google-calendar/337150/send-alive5-text-messages-for-new-events-starting-in-google-calendar',
    },
    log: {
      trigger: ['alive5', 'Alive5', 'SMS Conversation'],
      action: ['sheets', 'Google Sheets', 'Create Spreadsheet Row'],
      label: 'Conversation log',
      message: 'Alex Morgan · Incoming SMS\n“Thanks! Tomorrow at 10 works for me.”',
      footer: 'A new row in your shared spreadsheet',
      path: 'google-sheets',
    },
    notify: {
      trigger: ['alive5', 'Alive5', 'Chat Start'],
      action: ['slack', 'Slack', 'Send Channel Message'],
      label: '#customer-conversations',
      message: 'A new live chat is waiting in Alive5. Your team can pick up the conversation from the inbox.',
      footer: 'Keep your team up to date',
      path: 'slack',
    },
  };
  const setText = (name, text) => { product.querySelector(`[data-${name}]`).textContent = text; };
  const update = (key, announce = false) => {
    const example = examples[key];
    if (!example) return;
    for (const step of ['trigger', 'action']) {
      const [kind, app, event] = example[step];
      const node = product.querySelector(`[data-${step}-icon]`);
      node.className = `zapier-app-icon ${kind}`;
      node.innerHTML = icon(kind);
      setText(`${step}-app`, app);
      setText(`${step}-event`, event);
    }
    setText('result-label', example.label);
    setText('result-message', example.message);
    setText('result-footer', example.footer);
    const link = product.querySelector('[data-zapier-template]');
    link.href = `https://zapier.com/apps/alive5/integrations/${example.path}`;
    link.innerHTML = `${key === 'reminder' ? 'Explore this template' : 'Explore these templates'} <span aria-hidden="true">↗</span>`;
    if (announce) setText('workflow-announcement', `${example.trigger[1]}: ${example.trigger[2]}, then ${example.action[1]}: ${example.action[2]}. Example preview updated.`);
  };
  product.querySelectorAll('input[name="workflow"]').forEach((input) => {
    input.addEventListener('change', () => update(input.value, true));
  });
  update(product.querySelector('input[name="workflow"]:checked').value);
})();
