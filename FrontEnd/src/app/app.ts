import { Component, computed, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

type UserRole = 'funcionario' | 'rh' | 'contabilidade';
type Owner = 'funcionario' | 'rh' | 'contabilidade';
type RequestStatus = 'aberto' | 'pendente' | 'resolvido';
type RequestFilter = 'Todas' | 'Aberto' | 'Pendente' | 'Resolvido';
type MessageRole = Owner;
type ReplyTarget = 'funcionario' | 'rh' | 'contabilidade' | 'resolvido';
type DeadlineState = 'atrasado' | 'hoje' | 'proximo' | 'futuro' | 'sem_prazo' | 'encerrado';

interface Employee {
  id: string;
  empresa_id: string;
  nome: string;
  cargo: string;
  email?: string;
  situacao?: string;
}

interface Company {
  id: string;
  nome: string;
  rh_nome: string;
  rh_cargo?: string;
  rh_email?: string;
}

interface AccountingContact {
  nome: string;
  cargo: string;
  email: string;
}

interface ChatMessage {
  data: string;
  autor: string;
  papel: MessageRole;
  mensagem: string;
  canal?: string;
  anexos?: string[];
}

interface RawRequest {
  id: string;
  empresa_id: string;
  funcionario_id: string;
  tipo: string;
  titulo: string;
  descricao: string;
  aberta_por: string;
  responsavel: string;
  status: string;
  criada_em: string;
  prazo: string | null;
  resolvida_em: string | null;
  canal_origem?: string;
  bloqueia_fechamento?: boolean;
  historico: ChatMessage[];
}

interface RequestDataset {
  meta?: { data_referencia?: string };
  escritorio?: { responsavel_dp?: AccountingContact };
  empresas: Company[];
  funcionarios: Employee[];
  pendencias: RawRequest[];
}

interface ServiceRequest extends RawRequest {
  status: RequestStatus;
  dono: Owner;
  historico: ChatMessage[];
  funcionarioNome: string;
  funcionarioEmail: string;
  empresaNome: string;
  abertaPorNome: string;
}

interface Deadline {
  state: DeadlineState;
  label: string;
}

const filters: RequestFilter[] = ['Todas', 'Aberto', 'Pendente', 'Resolvido'];
const ownerFilters: { value: Owner | 'todos'; label: string }[] = [
  { value: 'todos', label: 'Todos' },
  { value: 'rh', label: 'RH' },
  { value: 'contabilidade', label: 'Contabilidade' },
  { value: 'funcionario', label: 'Funcionário' }
];
const requestTypes: Record<string, string> = {
  ferias: 'Férias',
  atestado: 'Atestado',
  dados_bancarios: 'Troca de conta bancária',
  duvida_holerite: 'Dúvida sobre holerite',
  dependente: 'Dependente',
  duvida_beneficio: 'Dúvida sobre benefício',
  duvida_ponto: 'Dúvida sobre ponto',
  admissao: 'Admissão',
  rescisao: 'Rescisão',
  horas_extras: 'Horas extras',
  ponto: 'Ponto',
  afastamento: 'Afastamento',
  cadastro: 'Cadastro',
  alteracao_salarial: 'Alteração salarial',
  documento_empresa: 'Documento da empresa'
};
const channels: Record<string, string> = {
  whatsapp: 'WhatsApp',
  email: 'E-mail',
  telefone: 'Ligação',
  presencial: 'Presencial',
  rh_net: 'Interação SCI'
};
const statusMapping: Record<string, RequestStatus> = {
  aberta: 'aberto',
  aguardando_rh: 'aberto',
  aguardando_contabilidade: 'aberto',
  aguardando_funcionario: 'pendente',
  resolvida: 'resolvido'
};
const ownerMapping: Record<string, Owner> = {
  rh: 'rh',
  funcionario: 'funcionario',
  contabilidade: 'contabilidade'
};
const replyTargetEffects: Record<ReplyTarget, { status: RequestStatus; dono: Owner | 'autor' }> = {
  funcionario: { status: 'pendente', dono: 'funcionario' },
  rh: { status: 'aberto', dono: 'rh' },
  contabilidade: { status: 'aberto', dono: 'contabilidade' },
  resolvido: { status: 'resolvido', dono: 'autor' }
};
const deadlineRank: Record<DeadlineState, number> = {
  atrasado: 0,
  hoje: 1,
  proximo: 2,
  futuro: 3,
  sem_prazo: 4,
  encerrado: 5
};
const dayInMs = 86400000;

function toDayNumber(date: string): number | null {
  const [year, month, day] = date.slice(0, 10).split('-').map(Number);
  if (!year || !month || !day) return null;
  return Date.UTC(year, month - 1, day) / dayInMs;
}

@Component({
  selector: 'app-root',
  imports: [FormsModule],
  templateUrl: './dashboard.html',
  host: { '(document:keydown.escape)': 'closeTopLayer()' }
})
export class App {
  protected readonly role = signal<UserRole>('funcionario');
  protected readonly employees = signal<Employee[]>([]);
  protected readonly companies = signal<Company[]>([]);
  protected readonly requests = signal<ServiceRequest[]>([]);
  protected readonly accounting = signal<AccountingContact>({ nome: 'Contabilidade', cargo: 'Departamento Pessoal', email: '' });
  protected readonly referenceDate = signal('');
  protected readonly selectedEmployeeId = signal('');
  protected readonly selectedCompanyId = signal('');
  protected readonly filters = filters;
  protected readonly ownerFilters = ownerFilters;
  protected readonly activeFilter = signal<RequestFilter>('Todas');
  protected readonly ownerFilter = signal<Owner | 'todos'>('todos');
  protected readonly urgentOnly = signal(false);
  protected readonly searchQuery = signal('');
  protected readonly loading = signal(true);
  protected readonly loadError = signal('');
  protected readonly showRequestModal = signal(false);
  protected readonly newRequestAttachment = signal('');
  protected readonly newDraft = { tipo: 'ferias', titulo: '', mensagem: '' };
  protected readonly selectedRequestId = signal<string | null>(null);
  protected readonly replyText = signal('');
  protected readonly replyTarget = signal<ReplyTarget>('funcionario');
  protected readonly replyDeadline = signal('');
  protected readonly chatAttachments = signal<string[]>([]);

  protected readonly isStaff = computed(() => this.role() !== 'funcionario');
  protected readonly currentEmployee = computed(() => this.employees().find((employee) => employee.id === this.selectedEmployeeId()));
  protected readonly currentCompany = computed(() => {
    if (this.role() === 'rh') return this.companies().find((company) => company.id === this.selectedCompanyId());
    const employee = this.currentEmployee();
    return this.companies().find((company) => company.id === employee?.empresa_id);
  });

  protected readonly profileName = computed(() => {
    if (this.role() === 'contabilidade') return this.accounting().nome;
    if (this.role() === 'rh') return this.currentCompany()?.rh_nome ?? 'Equipe de RH';
    return this.currentEmployee()?.nome ?? '';
  });
  protected readonly profileRoleLabel = computed(() => {
    if (this.role() === 'contabilidade') return this.accounting().cargo;
    if (this.role() === 'rh') return this.currentCompany()?.rh_cargo ?? 'Recursos Humanos';
    return this.currentEmployee()?.cargo ?? '';
  });
  protected readonly profileEmail = computed(() => {
    if (this.role() === 'contabilidade') return this.accounting().email;
    if (this.role() === 'rh') return this.currentCompany()?.rh_email ?? '';
    return this.currentEmployee()?.email ?? '';
  });
  protected readonly profileInitials = computed(() => this.initials(this.profileName()));

  protected readonly scopedRequests = computed(() => {
    const role = this.role();
    if (role === 'funcionario') return this.requests().filter((request) => request.funcionario_id === this.selectedEmployeeId());
    if (role === 'rh' && this.selectedCompanyId()) return this.requests().filter((request) => request.empresa_id === this.selectedCompanyId());
    return this.requests();
  });

  protected readonly baseRequests = computed(() => {
    const owner = this.ownerFilter();
    const urgent = this.urgentOnly();
    const query = this.searchQuery().trim().toLocaleLowerCase('pt-BR');
    return this.scopedRequests().filter((request) => {
      if (owner !== 'todos' && (request.status === 'resolvido' || request.dono !== owner)) return false;
      if (urgent && !this.isUrgent(request)) return false;
      if (!query) return true;
      const haystack = `${request.id} ${request.titulo} ${request.descricao} ${this.typeLabel(request.tipo)} ${request.funcionarioNome} ${request.funcionarioEmail} ${request.empresaNome}`;
      return haystack.toLocaleLowerCase('pt-BR').includes(query);
    });
  });

  protected readonly filteredRequests = computed(() => {
    const filter = this.activeFilter();
    const matching = filter === 'Todas'
      ? this.baseRequests()
      : this.baseRequests().filter((request) => request.status === filter.toLocaleLowerCase('pt-BR'));
    return [...matching].sort((a, b) => {
      const rankDiff = deadlineRank[this.deadline(a).state] - deadlineRank[this.deadline(b).state];
      if (rankDiff !== 0) return rankDiff;
      const blockDiff = Number(b.bloqueia_fechamento ?? false) - Number(a.bloqueia_fechamento ?? false);
      if (blockDiff !== 0) return blockDiff;
      if (a.prazo !== b.prazo) return (a.prazo ?? '9999-12-31').localeCompare(b.prazo ?? '9999-12-31');
      return a.id.localeCompare(b.id);
    });
  });

  protected readonly waitingForEmployee = computed(() => this.scopedRequests().filter((request) => request.status === 'pendente'));
  protected readonly overdueRequests = computed(() => this.scopedRequests().filter((request) => this.deadline(request).state === 'atrasado'));
  protected readonly blockingRequests = computed(() => this.scopedRequests().filter((request) => request.bloqueia_fechamento && request.status !== 'resolvido'));
  protected readonly myQueue = computed(() => this.scopedRequests().filter((request) => request.status !== 'resolvido' && request.dono === this.role()));
  protected readonly selectedRequest = computed(() => this.requests().find((request) => request.id === this.selectedRequestId()));

  constructor() {
    void this.loadDataset();
  }

  /** Resolve o dataset a partir do `<base href>` para o app funcionar em subdiretorio (GitHub Pages). */
  private datasetUrl(): string {
    const base = typeof document === 'undefined' ? '/' : document.baseURI;
    return new URL('data/fecha-comigo.json', base).toString();
  }

  protected async loadDataset(): Promise<void> {
    this.loading.set(true);
    this.loadError.set('');
    try {
      const response = await fetch(this.datasetUrl());
      if (!response.ok) throw new Error(`Não foi possível carregar o JSON (${response.status}).`);
      const data = await response.json() as RequestDataset;
      this.employees.set(data.funcionarios);
      this.companies.set(data.empresas);
      this.referenceDate.set(data.meta?.data_referencia ?? '');
      if (data.escritorio?.responsavel_dp) this.accounting.set(data.escritorio.responsavel_dp);
      this.requests.set(data.pendencias.map((request) => this.adaptRequest(request, data)));
      this.selectedEmployeeId.set(data.funcionarios[0]?.id ?? '');
      this.selectedCompanyId.set('');
    } catch (error) {
      this.loadError.set(error instanceof Error ? error.message : 'Ocorreu um erro ao carregar os dados.');
    } finally {
      this.loading.set(false);
    }
  }

  private adaptRequest(request: RawRequest, data: RequestDataset): ServiceRequest {
    const employee = data.funcionarios.find((item) => item.id === request.funcionario_id);
    const company = data.empresas.find((item) => item.id === request.empresa_id);
    const history = request.historico ?? [];
    const employeeName = employee?.nome ?? 'Funcionário não identificado';
    const status = statusMapping[request.status] ?? 'aberto';
    const opener = request.aberta_por === 'funcionario'
      ? employeeName
      : request.aberta_por === 'rh'
        ? company?.rh_nome ?? 'Equipe de RH'
        : history.find((message) => message.papel === 'contabilidade')?.autor ?? data.escritorio?.responsavel_dp?.nome ?? 'Contabilidade';
    return {
      ...request,
      status,
      dono: ownerMapping[request.responsavel] ?? (status === 'pendente' ? 'funcionario' : 'rh'),
      historico: history,
      funcionarioNome: employeeName,
      funcionarioEmail: employee?.email ?? '',
      empresaNome: company?.nome ?? 'Empresa não identificada',
      abertaPorNome: opener
    };
  }

  protected today(): string {
    return this.referenceDate() || new Date().toISOString().slice(0, 10);
  }

  private nowIso(): string {
    return `${this.today()}T${new Date().toISOString().slice(11)}`;
  }

  protected setRole(role: UserRole): void {
    this.role.set(role);
    this.activeFilter.set('Todas');
    this.ownerFilter.set('todos');
    this.urgentOnly.set(false);
    this.searchQuery.set('');
    this.selectedCompanyId.set('');
    this.closeChat();
  }

  protected statusCount(filter: RequestFilter): number {
    if (filter === 'Todas') return this.baseRequests().length;
    const status = filter.toLocaleLowerCase('pt-BR');
    return this.baseRequests().filter((request) => request.status === status).length;
  }

  protected ownerCount(owner: Owner | 'todos'): number {
    if (owner === 'todos') return this.scopedRequests().length;
    return this.scopedRequests().filter((request) => request.status !== 'resolvido' && request.dono === owner).length;
  }

  protected statusLabel(status: RequestStatus): string {
    return status.charAt(0).toLocaleUpperCase('pt-BR') + status.slice(1);
  }

  protected statusClass(status: RequestStatus): string {
    return `status-pill status-${status}`;
  }

  protected filterClass(filter: RequestFilter): string {
    return `summary-${filter.toLocaleLowerCase('pt-BR')}`;
  }

  protected typeLabel(type: string): string {
    return requestTypes[type] ?? type.replaceAll('_', ' ');
  }

  protected channelLabel(channel: string | undefined): string {
    if (!channel) return '';
    return channels[channel] ?? channel.replaceAll('_', ' ');
  }

  protected ownerLabel(owner: Owner): string {
    if (owner === 'funcionario') return 'Funcionário';
    if (owner === 'contabilidade') return 'Contabilidade';
    return 'RH';
  }

  protected ownerName(request: ServiceRequest): string {
    if (request.dono === 'funcionario') return request.funcionarioNome;
    if (request.dono === 'contabilidade') return this.accounting().nome;
    return this.companies().find((company) => company.id === request.empresa_id)?.rh_nome ?? 'Equipe de RH';
  }

  protected ownerClass(request: ServiceRequest): string {
    return `owner-badge owner-${request.dono}${request.dono === this.role() ? ' owner-mine' : ''}`;
  }

  protected deadline(request: ServiceRequest): Deadline {
    if (request.status === 'resolvido') {
      return { state: 'encerrado', label: request.resolvida_em ? `Encerrada em ${this.formatDate(request.resolvida_em)}` : 'Encerrada' };
    }
    if (!request.prazo) return { state: 'sem_prazo', label: 'Sem prazo definido' };
    const target = toDayNumber(request.prazo);
    const current = toDayNumber(this.today());
    if (target === null || current === null) return { state: 'sem_prazo', label: 'Sem prazo definido' };
    const days = target - current;
    if (days < 0) return { state: 'atrasado', label: days === -1 ? 'Atrasada há 1 dia' : `Atrasada há ${Math.abs(days)} dias` };
    if (days === 0) return { state: 'hoje', label: 'Vence hoje' };
    if (days === 1) return { state: 'proximo', label: 'Vence amanhã' };
    if (days <= 3) return { state: 'proximo', label: `Vence em ${days} dias` };
    return { state: 'futuro', label: `Prazo ${this.formatDate(request.prazo)}` };
  }

  protected deadlineClass(request: ServiceRequest): string {
    return `deadline-badge deadline-${this.deadline(request).state}`;
  }

  protected isUrgent(request: ServiceRequest): boolean {
    if (request.status === 'resolvido') return false;
    const state = this.deadline(request).state;
    return state === 'atrasado' || state === 'hoje' || (request.bloqueia_fechamento ?? false);
  }

  protected categoryClass(type: string): string {
    const knownTypes = ['ferias', 'atestado', 'dados_bancarios', 'duvida_holerite', 'dependente'];
    return knownTypes.includes(type) ? `category-${type}` : 'category-other';
  }

  protected categoryAbbreviation(type: string): string {
    const abbreviations: Record<string, string> = {
      ferias: 'FE',
      atestado: 'AT',
      dados_bancarios: 'BC',
      duvida_holerite: 'HL',
      dependente: 'DP'
    };
    return abbreviations[type] ?? type.slice(0, 2).toLocaleUpperCase('pt-BR');
  }

  protected initials(name: string): string {
    return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part.charAt(0)).join('').toLocaleUpperCase('pt-BR');
  }

  protected avatarClass(name: string): string {
    return `avatar-${(name.charCodeAt(0) || 0) % 4}`;
  }

  protected roleLabel(role: MessageRole): string {
    return this.ownerLabel(role);
  }

  protected isOwnMessage(message: ChatMessage): boolean {
    return message.papel === this.role();
  }

  protected lastMessage(request: ServiceRequest): ChatMessage | undefined {
    return request.historico.at(-1);
  }

  protected formatDate(value: string, includeTime = false): string {
    const hasTime = value.length > 10;
    const date = new Date(hasTime ? value : `${value}T12:00:00`);
    if (Number.isNaN(date.getTime())) return value;
    return new Intl.DateTimeFormat('pt-BR', includeTime && hasTime
      ? { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }
      : { day: '2-digit', month: 'short', year: 'numeric' }).format(date);
  }

  protected replyTargets(): { value: ReplyTarget; label: string }[] {
    if (this.role() === 'contabilidade') {
      return [
        { value: 'rh', label: 'Aberto · devolver ao RH' },
        { value: 'funcionario', label: 'Pendente · aguardar o funcionário' },
        { value: 'contabilidade', label: 'Aberto · seguir com a contabilidade' },
        { value: 'resolvido', label: 'Resolvido · encerrar a conversa' }
      ];
    }
    return [
      { value: 'funcionario', label: 'Pendente · aguardar o funcionário' },
      { value: 'contabilidade', label: 'Aberto · encaminhar à contabilidade' },
      { value: 'rh', label: 'Aberto · seguir com o RH' },
      { value: 'resolvido', label: 'Resolvido · encerrar a conversa' }
    ];
  }

  private defaultReplyTarget(): ReplyTarget {
    return this.role() === 'contabilidade' ? 'rh' : 'funcionario';
  }

  protected openNewRequest(): void {
    this.newDraft.tipo = 'ferias';
    this.newDraft.titulo = '';
    this.newDraft.mensagem = '';
    this.newRequestAttachment.set('');
    this.showRequestModal.set(true);
  }

  protected onNewRequestFile(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.newRequestAttachment.set(input.files?.[0]?.name ?? '');
  }

  protected onChatFiles(event: Event): void {
    const input = event.target as HTMLInputElement;
    const names = Array.from(input.files ?? []).map((file) => file.name);
    this.chatAttachments.update((current) => [...current, ...names]);
    input.value = '';
  }

  protected updateReplyText(event: Event): void {
    this.replyText.set((event.target as HTMLTextAreaElement).value);
  }

  protected setReplyTarget(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    if (value === 'funcionario' || value === 'rh' || value === 'contabilidade' || value === 'resolvido') {
      this.replyTarget.set(value);
    }
  }

  protected setReplyDeadline(event: Event): void {
    this.replyDeadline.set((event.target as HTMLInputElement).value);
  }

  protected closeTopLayer(): void {
    if (this.selectedRequestId()) {
      this.closeChat();
      return;
    }
    if (this.showRequestModal()) this.showRequestModal.set(false);
  }

  protected createRequest(): void {
    const employee = this.currentEmployee();
    const company = this.currentCompany();
    const title = this.newDraft.titulo.trim();
    const message = this.newDraft.mensagem.trim();
    if (!employee || !company || !title || !message) return;

    const nextNumber = Math.max(0, ...this.requests().map((request) => Number(request.id.slice(1)) || 0)) + 1;
    const id = `P${String(nextNumber).padStart(3, '0')}`;
    const now = this.nowIso();
    const attachments = this.newRequestAttachment() ? [this.newRequestAttachment()] : [];
    const request: ServiceRequest = {
      id,
      empresa_id: company.id,
      funcionario_id: employee.id,
      tipo: this.newDraft.tipo,
      titulo: title,
      descricao: message,
      aberta_por: 'funcionario',
      responsavel: 'rh',
      status: 'aberto',
      dono: 'rh',
      criada_em: now.slice(0, 10),
      prazo: null,
      resolvida_em: null,
      canal_origem: 'rh_net',
      bloqueia_fechamento: false,
      historico: [{ data: now, autor: employee.nome, papel: 'funcionario', mensagem: message, canal: 'rh_net', anexos: attachments }],
      funcionarioNome: employee.nome,
      funcionarioEmail: employee.email ?? '',
      empresaNome: company.nome,
      abertaPorNome: employee.nome
    };
    this.requests.update((requests) => [request, ...requests]);
    this.activeFilter.set('Todas');
    this.ownerFilter.set('todos');
    this.urgentOnly.set(false);
    this.searchQuery.set('');
    this.showRequestModal.set(false);
    this.openChat(id);
  }

  protected openChat(requestId: string): void {
    this.selectedRequestId.set(requestId);
    this.replyText.set('');
    this.replyTarget.set(this.defaultReplyTarget());
    this.replyDeadline.set(this.requests().find((request) => request.id === requestId)?.prazo ?? '');
    this.chatAttachments.set([]);
  }

  protected closeChat(): void {
    this.selectedRequestId.set(null);
    this.replyText.set('');
    this.replyDeadline.set('');
    this.chatAttachments.set([]);
  }

  protected sendMessage(request: ServiceRequest): void {
    const message = this.replyText().trim();
    if (!message || request.status === 'resolvido') return;

    const role: UserRole = this.role();
    const author = this.messageAuthor(request, role);
    const effect = role === 'funcionario'
      ? { status: 'aberto' as RequestStatus, dono: 'rh' as Owner }
      : replyTargetEffects[this.replyTarget()];
    const dono: Owner = effect.dono === 'autor' ? role : effect.dono;
    const status = effect.status;
    const deadline = role === 'funcionario' ? request.prazo : (this.replyDeadline() || null);
    const attachments = [...this.chatAttachments()];
    const now = this.nowIso();

    this.requests.update((requests) => requests.map((item) => item.id === request.id ? {
      ...item,
      status,
      dono,
      responsavel: dono,
      prazo: deadline,
      resolvida_em: status === 'resolvido' ? now.slice(0, 10) : null,
      historico: [...item.historico, { data: now, autor: author, papel: role, mensagem: message, canal: 'rh_net', anexos: attachments }]
    } : item));
    this.replyText.set('');
    this.chatAttachments.set([]);
    this.replyTarget.set(this.defaultReplyTarget());
    this.replyDeadline.set(deadline ?? '');
  }

  private messageAuthor(request: ServiceRequest, role: UserRole): string {
    if (role === 'contabilidade') return this.accounting().nome;
    if (role === 'rh') return this.companies().find((company) => company.id === request.empresa_id)?.rh_nome ?? 'Equipe de RH';
    return this.currentEmployee()?.nome ?? request.funcionarioNome;
  }

  protected reopenRequest(requestId: string): void {
    if (!this.isStaff()) return;
    const dono: Owner = this.role() === 'contabilidade' ? 'contabilidade' : 'rh';
    this.requests.update((requests) => requests.map((request) => request.id === requestId ? {
      ...request,
      status: 'aberto',
      dono,
      responsavel: dono,
      resolvida_em: null
    } : request));
    this.replyTarget.set(this.defaultReplyTarget());
  }
}
