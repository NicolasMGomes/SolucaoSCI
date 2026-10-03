import { TestBed } from '@angular/core/testing';
import { App } from './app';
import { vi } from 'vitest';

function mockDataset() {
  return {
    empresas: [{ id: 'E1', nome: 'Empresa Exemplo', rh_nome: 'Ana do RH' }],
    funcionarios: [
      { id: 'F01', empresa_id: 'E1', nome: 'Marina Souza', cargo: 'Analista' },
      { id: 'F02', empresa_id: 'E1', nome: 'Kauã Oliveira', cargo: 'Assistente' }
    ],
    pendencias: [
      {
        id: 'P001', empresa_id: 'E1', funcionario_id: 'F01', tipo: 'ferias', titulo: 'Férias de dezembro',
        descricao: 'Solicitação de férias.', aberta_por: 'funcionario', responsavel: 'rh', status: 'aberta',
        criada_em: '2026-10-01', prazo: null, resolvida_em: null,
        historico: [{ data: '2026-10-01', autor: 'Marina Souza', papel: 'funcionario', mensagem: 'Quero solicitar férias.' }]
      },
      {
        id: 'P002', empresa_id: 'E1', funcionario_id: 'F02', tipo: 'atestado', titulo: 'Envio de atestado',
        descricao: 'Anexo do atestado médico.', aberta_por: 'contabilidade', responsavel: 'funcionario', status: 'aguardando_funcionario',
        criada_em: '2026-10-02', prazo: null, resolvida_em: null,
        historico: [{ data: '2026-10-02', autor: 'Ana do RH', papel: 'rh', mensagem: 'Pode enviar o documento?' }]
      }
    ]
  };
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
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('h1')?.textContent).toContain('Minhas requisições');
    expect(compiled.querySelectorAll('.request-card')).toHaveLength(1);
    expect(compiled.textContent).toContain('Marina Souza');

    compiled.querySelector<HTMLButtonElement>('.request-card')?.click();
    fixture.detectChanges();
    expect(compiled.querySelector('[role="dialog"]')?.textContent).toContain('Quero solicitar férias.');
  });

  it('shows every request with normalized statuses in the RH view', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    const rhButton = Array.from(compiled.querySelectorAll('button')).find((button) => button.textContent?.trim() === 'RH');
    rhButton?.click();
    fixture.detectChanges();

    expect(compiled.querySelector('h1')?.textContent).toContain('Painel de RH');
    expect(compiled.querySelectorAll('.request-card')).toHaveLength(2);
    expect(compiled.querySelector('.summary-grid')?.textContent).toContain('Pendente');
    expect(compiled.querySelector('.request-list')?.textContent).toContain('Pendente');
  });

  it('moves a chat between employee and RH statuses and allows reopening', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;

    const employeeSelect = compiled.querySelector<HTMLSelectElement>('[aria-label="Selecionar funcionário"]')!;
    employeeSelect.value = 'F02';
    employeeSelect.dispatchEvent(new Event('change', { bubbles: true }));
    await fixture.whenStable();
    fixture.detectChanges();
    Array.from(compiled.querySelectorAll<HTMLButtonElement>('.request-card')).find((card) => card.textContent?.includes('P002'))!.click();
    fixture.detectChanges();

    const employeeReply = compiled.querySelector<HTMLTextAreaElement>('.chat-composer textarea[name="reply"]')!;
    employeeReply.value = 'Enviei os dados solicitados.';
    employeeReply.dispatchEvent(new Event('input', { bubbles: true }));
    await fixture.whenStable();
    fixture.detectChanges();
    compiled.querySelector<HTMLButtonElement>('.chat-composer button[type="submit"]')!.click();
    fixture.detectChanges();
    expect(compiled.querySelector('[role="dialog"]')?.textContent).toContain('Aberto');

    compiled.querySelector<HTMLButtonElement>('.role-switch button:last-child')!.click();
    fixture.detectChanges();
    Array.from(compiled.querySelectorAll<HTMLButtonElement>('.request-card')).find((card) => card.textContent?.includes('P002'))!.click();
    fixture.detectChanges();

    const statusSelect = compiled.querySelector<HTMLSelectElement>('.reply-status select')!;
    statusSelect.value = 'resolvido';
    statusSelect.dispatchEvent(new Event('change', { bubbles: true }));
    await fixture.whenStable();
    fixture.detectChanges();
    const rhReply = compiled.querySelector<HTMLTextAreaElement>('.chat-composer textarea[name="reply"]')!;
    rhReply.value = 'Solicitação concluída.';
    rhReply.dispatchEvent(new Event('input', { bubbles: true }));
    await fixture.whenStable();
    fixture.detectChanges();
    compiled.querySelector<HTMLButtonElement>('.chat-composer button[type="submit"]')!.click();
    fixture.detectChanges();
    expect(compiled.querySelector('.chat-closed')?.textContent).toContain('conversa foi encerrada');

    compiled.querySelector<HTMLButtonElement>('.reopen-button')!.click();
    fixture.detectChanges();
    expect(compiled.querySelector('[role="dialog"]')?.textContent).toContain('Aberto');
    expect(compiled.querySelector('.chat-composer')).toBeTruthy();
  });
});
