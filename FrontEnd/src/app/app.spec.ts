import { TestBed } from '@angular/core/testing';
import { App } from './app';
import { vi } from 'vitest';

function mockDataset() {
  return {
    meta: { data_referencia: '2026-10-20' },
    escritorio: { responsavel_dp: { nome: 'Carlos Eduardo Sens', cargo: 'Analista de DP', email: 'carlos@contacerta.exemplo' } },
    empresas: [
      { id: 'E1', nome: 'Empresa Exemplo', rh_nome: 'Ana do RH', rh_cargo: 'Analista de RH', rh_email: 'ana@exemplo.com' },
      { id: 'E2', nome: 'Outra Empresa', rh_nome: 'Bruno do RH', rh_cargo: 'Coordenador', rh_email: 'bruno@outra.com' }
    ],
    funcionarios: [
      { id: 'F01', empresa_id: 'E1', nome: 'Marina Souza', cargo: 'Analista', email: 'marina@exemplo.com' },
      { id: 'F02', empresa_id: 'E1', nome: 'Kauã Oliveira', cargo: 'Assistente', email: 'kaua@exemplo.com' }
    ],
    pendencias: [
      {
        id: 'P001', empresa_id: 'E1', funcionario_id: 'F01', tipo: 'ferias', titulo: 'Férias de dezembro',
        descricao: 'Solicitação de férias.', aberta_por: 'funcionario', responsavel: 'rh', status: 'aberta',
        criada_em: '2026-10-01', prazo: '2026-10-18', resolvida_em: null, canal_origem: 'rh_net', bloqueia_fechamento: false,
        historico: [{ data: '2026-10-01', autor: 'Marina Souza', papel: 'funcionario', mensagem: 'Quero solicitar férias.' }]
      },
      {
        id: 'P002', empresa_id: 'E1', funcionario_id: 'F02', tipo: 'atestado', titulo: 'Envio de atestado',
        descricao: 'Anexo do atestado médico.', aberta_por: 'contabilidade', responsavel: 'funcionario', status: 'aguardando_funcionario',
        criada_em: '2026-10-02', prazo: '2026-10-25', resolvida_em: null, canal_origem: 'whatsapp', bloqueia_fechamento: true,
        historico: [{ data: '2026-10-02', autor: 'Ana do RH', papel: 'rh', mensagem: 'Pode enviar o documento?' }]
      },
      {
        id: 'P003', empresa_id: 'E2', funcionario_id: 'F99', tipo: 'horas_extras', titulo: 'Banco de horas de outubro',
        descricao: 'Conferência das horas extras.', aberta_por: 'rh', responsavel: 'contabilidade', status: 'aguardando_contabilidade',
        criada_em: '2026-10-05', prazo: '2026-10-20', resolvida_em: null, canal_origem: 'email', bloqueia_fechamento: true,
        historico: [{ data: '2026-10-05', autor: 'Bruno do RH', papel: 'rh', mensagem: 'Podem conferir as horas?' }]
      }
    ]
  };
}

function roleButton(root: HTMLElement, label: string): HTMLButtonElement {
  return Array.from(root.querySelectorAll<HTMLButtonElement>('.role-switch button')).find((button) => button.textContent?.trim() === label)!;
}

function card(root: HTMLElement, id: string): HTMLButtonElement {
  return Array.from(root.querySelectorAll<HTMLButtonElement>('.request-card')).find((item) => item.textContent?.includes(id))!;
}

async function mount() {
  const fixture = TestBed.createComponent(App);
  await fixture.whenStable();
  fixture.detectChanges();
  return { fixture, root: fixture.nativeElement as HTMLElement };
}

async function type(fixture: Awaited<ReturnType<typeof mount>>['fixture'], element: HTMLTextAreaElement | HTMLInputElement, value: string) {
  element.value = value;
  element.dispatchEvent(new Event('input', { bubbles: true }));
  await fixture.whenStable();
  fixture.detectChanges();
}

describe('App', () => {
  beforeEach(async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockDataset()
    }));
    await TestBed.configureTestingModule({
      imports: [App]
    }).compileComponents();
  });

  afterEach(() => vi.unstubAllGlobals());

  it('shows only the selected employee requests and opens its chat history', async () => {
    const { fixture, root } = await mount();

    expect(root.querySelector('h1')?.textContent).toContain('Minhas requisições');
    expect(root.querySelectorAll('.request-card')).toHaveLength(1);
    expect(root.textContent).toContain('Marina Souza');

    root.querySelector<HTMLButtonElement>('.request-card')?.click();
    fixture.detectChanges();
    expect(root.querySelector('[role="dialog"]')?.textContent).toContain('Quero solicitar férias.');
  });

  it('shows every request with normalized statuses in the RH view', async () => {
    const { fixture, root } = await mount();

    roleButton(root, 'RH').click();
    fixture.detectChanges();

    expect(root.querySelector('h1')?.textContent).toContain('Painel de RH');
    expect(root.querySelectorAll('.request-card')).toHaveLength(3);
    expect(root.querySelector('.summary-grid')?.textContent).toContain('Pendente');
    expect(root.querySelector('.request-list')?.textContent).toContain('Pendente');
  });

  it('renders owner and deadline for each request using the dataset reference date', async () => {
    const { fixture, root } = await mount();

    roleButton(root, 'RH').click();
    fixture.detectChanges();

    const overdue = card(root, 'P001');
    expect(overdue.querySelector('.deadline-atrasado')?.textContent).toContain('Atrasada há 2 dias');
    expect(overdue.querySelector('.owner-rh')?.textContent).toContain('Bola com RH');
    expect(overdue.querySelector('.owner-rh')?.textContent).toContain('Ana do RH');

    const accounting = card(root, 'P003');
    expect(accounting.querySelector('.owner-contabilidade')?.textContent).toContain('Contabilidade');
    expect(accounting.querySelector('.deadline-hoje')?.textContent).toContain('Vence hoje');
    expect(accounting.querySelector('.blocking-badge')).toBeTruthy();

    expect(card(root, 'P002').querySelector('.owner-funcionario')?.textContent).toContain('Kauã Oliveira');
    expect(root.querySelector('.banner-critical')?.textContent).toContain('1 requisição atrasada');
  });

  it('orders the list by deadline urgency', async () => {
    const { fixture, root } = await mount();

    roleButton(root, 'RH').click();
    fixture.detectChanges();

    const ids = Array.from(root.querySelectorAll('.request-card .request-overline > span:first-child')).map((span) => span.textContent?.trim());
    expect(ids).toEqual(['P001', 'P003', 'P002']);
  });

  it('filters by owner and by urgency', async () => {
    const { fixture, root } = await mount();

    roleButton(root, 'Contabilidade').click();
    fixture.detectChanges();
    expect(root.querySelector('h1')?.textContent).toContain('Painel da contabilidade');

    const ownerChip = Array.from(root.querySelectorAll<HTMLButtonElement>('.filter-row button')).find((button) => button.textContent?.includes('Contabilidade'))!;
    ownerChip.click();
    fixture.detectChanges();
    expect(root.querySelectorAll('.request-card')).toHaveLength(1);
    expect(root.querySelector('.request-card')?.textContent).toContain('P003');

    Array.from(root.querySelectorAll<HTMLButtonElement>('.filter-row button')).find((button) => button.textContent?.includes('Todos'))!.click();
    root.querySelector<HTMLButtonElement>('.chip-urgent')!.click();
    fixture.detectChanges();
    const urgentIds = Array.from(root.querySelectorAll('.request-card .request-overline > span:first-child')).map((span) => span.textContent?.trim());
    expect(urgentIds).toEqual(['P001', 'P003', 'P002']);
  });

  it('scopes the RH view to a single company', async () => {
    const { fixture, root } = await mount();

    roleButton(root, 'RH').click();
    fixture.detectChanges();

    const companySelect = root.querySelector<HTMLSelectElement>('[aria-label="Selecionar empresa"]')!;
    companySelect.value = 'E2';
    companySelect.dispatchEvent(new Event('change', { bubbles: true }));
    await fixture.whenStable();
    fixture.detectChanges();

    expect(root.querySelectorAll('.request-card')).toHaveLength(1);
    expect(root.querySelector('.request-card')?.textContent).toContain('P003');
    expect(root.querySelector('.profile-copy')?.textContent).toContain('Bruno do RH');
  });

  it('routes a request from RH to accounting and back, keeping the deadline', async () => {
    const { fixture, root } = await mount();

    roleButton(root, 'RH').click();
    fixture.detectChanges();
    card(root, 'P001').click();
    fixture.detectChanges();

    const targetSelect = root.querySelector<HTMLSelectElement>('.reply-status select')!;
    targetSelect.value = 'contabilidade';
    targetSelect.dispatchEvent(new Event('change', { bubbles: true }));
    const deadlineInput = root.querySelector<HTMLInputElement>('input[type="date"]')!;
    deadlineInput.value = '2026-10-23';
    deadlineInput.dispatchEvent(new Event('change', { bubbles: true }));
    await fixture.whenStable();
    fixture.detectChanges();
    await type(fixture, root.querySelector<HTMLTextAreaElement>('.chat-composer textarea[name="reply"]')!, 'Contabilidade, podem verificar?');
    root.querySelector<HTMLButtonElement>('.chat-composer button[type="submit"]')!.click();
    fixture.detectChanges();

    expect(root.querySelector('.chat-badges')?.textContent).toContain('Bola com Contabilidade');
    expect(root.querySelector('.chat-badges')?.textContent).toContain('Vence em 3 dias');

    root.querySelector<HTMLButtonElement>('.modal-close')!.click();
    roleButton(root, 'Contabilidade').click();
    fixture.detectChanges();
    card(root, 'P001').click();
    fixture.detectChanges();

    expect(root.querySelector<HTMLSelectElement>('.reply-status select')!.value).toBe('rh');
    await type(fixture, root.querySelector<HTMLTextAreaElement>('.chat-composer textarea[name="reply"]')!, 'Ajustado na folha, RH.');
    root.querySelector<HTMLButtonElement>('.chat-composer button[type="submit"]')!.click();
    fixture.detectChanges();

    expect(root.querySelector('.chat-badges')?.textContent).toContain('Bola com RH');
    expect(root.querySelector('.message-list')?.textContent).toContain('Carlos Eduardo Sens');
  });

  it('moves a chat between employee and RH statuses and allows reopening', async () => {
    const { fixture, root } = await mount();

    const employeeSelect = root.querySelector<HTMLSelectElement>('[aria-label="Selecionar funcionário"]')!;
    employeeSelect.value = 'F02';
    employeeSelect.dispatchEvent(new Event('change', { bubbles: true }));
    await fixture.whenStable();
    fixture.detectChanges();
    card(root, 'P002').click();
    fixture.detectChanges();

    await type(fixture, root.querySelector<HTMLTextAreaElement>('.chat-composer textarea[name="reply"]')!, 'Enviei os dados solicitados.');
    root.querySelector<HTMLButtonElement>('.chat-composer button[type="submit"]')!.click();
    fixture.detectChanges();
    expect(root.querySelector('[role="dialog"]')?.textContent).toContain('Aberto');
    expect(root.querySelector('.chat-badges')?.textContent).toContain('Bola com RH');

    roleButton(root, 'RH').click();
    fixture.detectChanges();
    card(root, 'P002').click();
    fixture.detectChanges();

    const statusSelect = root.querySelector<HTMLSelectElement>('.reply-status select')!;
    statusSelect.value = 'resolvido';
    statusSelect.dispatchEvent(new Event('change', { bubbles: true }));
    await fixture.whenStable();
    fixture.detectChanges();
    await type(fixture, root.querySelector<HTMLTextAreaElement>('.chat-composer textarea[name="reply"]')!, 'Solicitação concluída.');
    root.querySelector<HTMLButtonElement>('.chat-composer button[type="submit"]')!.click();
    fixture.detectChanges();
    expect(root.querySelector('.chat-closed')?.textContent).toContain('conversa foi encerrada');

    root.querySelector<HTMLButtonElement>('.reopen-button')!.click();
    fixture.detectChanges();
    expect(root.querySelector('[role="dialog"]')?.textContent).toContain('Aberto');
    expect(root.querySelector('.chat-composer')).toBeTruthy();
  });

  it('closes the open chat with the escape key', async () => {
    const { fixture, root } = await mount();

    root.querySelector<HTMLButtonElement>('.request-card')!.click();
    fixture.detectChanges();
    expect(root.querySelector('.chat-modal')).toBeTruthy();

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    fixture.detectChanges();
    expect(root.querySelector('.chat-modal')).toBeFalsy();
  });

  it('creates a request through the system channel and sends it to the RH queue', async () => {
    const { fixture, root } = await mount();

    root.querySelector<HTMLButtonElement>('.primary-button')!.click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(root.querySelector('.sender-note')?.textContent).toContain('marina@exemplo.com');

    await type(fixture, root.querySelector<HTMLInputElement>('input[name="title"]')!, 'Dependente novo');
    await type(fixture, root.querySelector<HTMLTextAreaElement>('textarea[name="message"]')!, 'Preciso incluir meu filho no plano.');
    root.querySelector<HTMLButtonElement>('.request-modal button[type="submit"]')!.click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(root.querySelector('.chat-badges')?.textContent).toContain('Bola com RH');
    expect(root.querySelector('.chat-badges')?.textContent).toContain('Sem prazo definido');
    expect(root.querySelector('.chat-context')?.textContent).toContain('Interação SCI');
  });
});
