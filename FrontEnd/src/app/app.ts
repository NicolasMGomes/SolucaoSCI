import { Component, computed, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

type UserRole = 'funcionario' | 'rh';
type RequestStatus = 'aberto' | 'pendente' | 'resolvido';
type RequestFilter = 'Todas' | 'Aberto' | 'Pendente' | 'Resolvido';
type MessageRole = 'funcionario' | 'rh' | 'contabilidade';

interface Employee {
  id: string;
  empresa_id: string;
  nome: string;
  cargo: string;
}

interface Company {
  id: string;
  nome: string;
  rh_nome: string;
}

interface ChatMessage {
  data: string;
  autor: string;
  papel: MessageRole;
  mensagem: string;
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
  historico: ChatMessage[];
}

interface RequestDataset {
  empresas: Company[];
  funcionarios: Employee[];
  pendencias: RawRequest[];
}

interface ServiceRequest extends RawRequest {
  status: RequestStatus;
  historico: ChatMessage[];
  funcionarioNome: string;
  empresaNome: string;
  abertaPorNome: string;
}

const filters: RequestFilter[] = ['Todas', 'Aberto', 'Pendente', 'Resolvido'];
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
const statusMapping: Record<string, RequestStatus> = {
  aberta: 'aberto',
  aguardando_rh: 'aberto',
  aguardando_contabilidade: 'aberto',
  aguardando_funcionario: 'pendente',
  resolvida: 'resolvido'
};

@Component({
  selector: 'app-root',
  imports: [FormsModule],
  templateUrl: './dashboard.html'
})
export class App {
  protected readonly role = signal<UserRole>('funcionario');
  protected readonly employees = signal<Employee[]>([]);
  protected readonly companies = signal<Company[]>([]);
  protected readonly requests = signal<ServiceRequest[]>([]);
  protected readonly selectedEmployeeId = signal('');
  protected readonly filters = filters;
  protected readonly activeFilter = signal<RequestFilter>('Todas');
  protected readonly searchQuery = signal('');
  protected readonly loading = signal(true);
  protected readonly loadError = signal('');
  protected readonly showRequestModal = signal(false);
  protected readonly newRequestAttachment = signal('');
  protected readonly newDraft = { tipo: 'ferias', titulo: '', mensagem: '' };
  protected readonly selectedRequestId = signal<string | null>(null);
  protected readonly replyText = signal('');
  protected readonly replyStatus = signal<RequestStatus>('pendente');
  protected readonly chatAttachments = signal<string[]>([]);

  protected readonly currentEmployee = computed(() => this.employees().find((employee) => employee.id === this.selectedEmployeeId()));
  protected readonly currentCompany = computed(() => {
    const employee = this.currentEmployee();
    return this.companies().find((company) => company.id === employee?.empresa_id);
  });
  protected readonly scopedRequests = computed(() => {
    if (this.role() === 'rh') return this.requests();
    return this.requests().filter((request) => request.funcionario_id === this.selectedEmployeeId());
  });
  protected readonly filteredRequests = computed(() => {
    const filter = this.activeFilter();
    const query = this.searchQuery().trim().toLocaleLowerCase('pt-BR');
    return this.scopedRequests().filter((request) => {
      const matchesFilter = filter === 'Todas' || request.status === filter.toLocaleLowerCase('pt-BR');
      const matchesSearch = !query || `${request.id} ${request.titulo} ${request.funcionarioNome} ${request.empresaNome}`.toLocaleLowerCase('pt-BR').includes(query);
      return matchesFilter && matchesSearch;
    });
  });
  protected readonly waitingForEmployee = computed(() => this.scopedRequests().filter((request) => request.status === 'pendente'));
  protected readonly selectedRequest = computed(() => this.requests().find((request) => request.id === this.selectedRequestId()));

  constructor() {
    void this.loadDataset();
  }

  protected async loadDataset(): Promise<void> {
    this.loading.set(true);
    this.loadError.set('');
    try {
      const response = await fetch('/data/fecha-comigo.json');
      if (!response.ok) throw new Error(`Não foi possível carregar o JSON (${response.status}).`);
      const data = await response.json() as RequestDataset;
      this.employees.set(data.funcionarios);
      this.companies.set(data.empresas);
      this.requests.set(data.pendencias.map((request) => {
        const employee = data.funcionarios.find((item) => item.id === request.funcionario_id);
        const company = data.empresas.find((item) => item.id === request.empresa_id);
        const history = request.historico ?? [];
        const employeeName = employee?.nome ?? 'Funcionário não identificado';
        const opener = request.aberta_por === 'funcionario'
          ? employeeName
          : request.aberta_por === 'rh'
            ? company?.rh_nome ?? 'Equipe de RH'
            : history.find((message) => message.papel === 'contabilidade')?.autor ?? 'Contabilidade';
        return {
          ...request,
          status: statusMapping[request.status] ?? 'aberto',
          historico: history,
          funcionarioNome: employeeName,
          empresaNome: company?.nome ?? 'Empresa não identificada',
          abertaPorNome: opener
        };
      }));
      this.selectedEmployeeId.set(data.funcionarios[0]?.id ?? '');
    } catch (error) {
      this.loadError.set(error instanceof Error ? error.message : 'Ocorreu um erro ao carregar os dados.');
    } finally {
      this.loading.set(false);
    }
  }

  protected setRole(role: UserRole): void {
    this.role.set(role);
    this.activeFilter.set('Todas');
    this.searchQuery.set('');
    this.closeChat();
  }

  protected statusCount(filter: RequestFilter): number {
    if (filter === 'Todas') return this.scopedRequests().length;
    const status = filter.toLocaleLowerCase('pt-BR');
    return this.scopedRequests().filter((request) => request.status === status).length;
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

  protected employeeInitials(): string {
    return this.initials(this.currentEmployee()?.nome ?? '');
  }

  protected avatarClass(name: string): string {
    return `avatar-${(name.charCodeAt(0) || 0) % 4}`;
  }

  protected roleLabel(role: MessageRole): string {
    if (role === 'funcionario') return 'Funcionário';
    if (role === 'contabilidade') return 'Contabilidade';
    return 'RH';
  }

  protected isOwnMessage(message: ChatMessage): boolean {
    return this.role() === 'funcionario' ? message.papel === 'funcionario' : message.papel === 'rh';
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

  protected setReplyStatus(event: Event): void {
    const status = (event.target as HTMLSelectElement).value;
    if (status === 'aberto' || status === 'pendente' || status === 'resolvido') {
      this.replyStatus.set(status);
    }
  }

  protected createRequest(): void {
    const employee = this.currentEmployee();
    const company = this.currentCompany();
    const title = this.newDraft.titulo.trim();
    const message = this.newDraft.mensagem.trim();
    if (!employee || !company || !title || !message) return;

    const nextNumber = Math.max(0, ...this.requests().map((request) => Number(request.id.slice(1)) || 0)) + 1;
    const id = `P${String(nextNumber).padStart(3, '0')}`;
    const now = new Date().toISOString();
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
      criada_em: now.slice(0, 10),
      prazo: null,
      resolvida_em: null,
      historico: [{ data: now, autor: employee.nome, papel: 'funcionario', mensagem: message, anexos: attachments }],
      funcionarioNome: employee.nome,
      empresaNome: company.nome,
      abertaPorNome: employee.nome
    };
    this.requests.update((requests) => [request, ...requests]);
    this.activeFilter.set('Todas');
    this.searchQuery.set('');
    this.showRequestModal.set(false);
    this.openChat(id);
  }

  protected openChat(requestId: string): void {
    this.selectedRequestId.set(requestId);
    this.replyText.set('');
    this.replyStatus.set('pendente');
    this.chatAttachments.set([]);
  }

  protected closeChat(): void {
    this.selectedRequestId.set(null);
    this.replyText.set('');
    this.chatAttachments.set([]);
  }

  protected sendMessage(request: ServiceRequest): void {
    const message = this.replyText().trim();
    if (!message || request.status === 'resolvido') return;

    const role: MessageRole = this.role();
    const author = role === 'rh'
      ? this.companies().find((company) => company.id === request.empresa_id)?.rh_nome ?? 'Equipe de RH'
      : this.currentEmployee()?.nome ?? request.funcionarioNome;
    const status: RequestStatus = role === 'rh' ? this.replyStatus() : 'aberto';
    const attachments = [...this.chatAttachments()];

    this.requests.update((requests) => requests.map((item) => item.id === request.id ? {
      ...item,
      status,
      responsavel: status === 'pendente' ? 'funcionario' : status === 'aberto' ? 'rh' : 'rh',
      resolvida_em: status === 'resolvido' ? new Date().toISOString().slice(0, 10) : null,
      historico: [...item.historico, { data: new Date().toISOString(), autor: author, papel: role, mensagem: message, anexos: attachments }]
    } : item));
    this.replyText.set('');
    this.chatAttachments.set([]);
    this.replyStatus.set('pendente');
  }

  protected reopenRequest(requestId: string): void {
    this.requests.update((requests) => requests.map((request) => request.id === requestId ? {
      ...request,
      status: 'aberto',
      responsavel: 'rh',
      resolvida_em: null
    } : request));
    this.replyStatus.set('pendente');
  }
}
