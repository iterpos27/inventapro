import 'dart:async';

import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../api_client.dart';
import '../app_theme.dart';
import '../local_store.dart';
import '../models.dart';
import '../widgets/api_settings.dart';
import '../widgets/common_widgets.dart';
import 'barcode_scanner_screen.dart';

class OperationHome extends StatefulWidget {
  const OperationHome({
    super.key,
    required this.api,
    required this.store,
    required this.user,
    required this.branding,
    required this.apiBaseUrl,
    required this.onApiBaseUrlChanged,
    required this.onLogout,
  });

  final ApiClient api;
  final LocalStore store;
  final SessionUser user;
  final BrandingConfig branding;
  final String apiBaseUrl;
  final Future<void> Function(String value) onApiBaseUrlChanged;
  final Future<void> Function() onLogout;

  @override
  State<OperationHome> createState() => _OperationHomeState();
}

class _OperationHomeState extends State<OperationHome>
    with WidgetsBindingObserver {
  static const int _maxCountDescription = 75;
  List<Toma> tomas = [];
  List<CountHistory> history = [];
  ConteoInfo? conteo;
  List<CountItem> items = [];
  List<Product> results = [];
  final searchCtrl = TextEditingController();
  final searchFocus = FocusNode();
  final Map<int, FocusNode> qtyFocusNodes = {};
  Timer? searchTimer;
  Timer? autoSaveTimer;
  StreamSubscription<List<ConnectivityResult>>? connectivitySub;
  bool loading = true;
  bool saving = false;
  String saveStatus = 'Sin cambios recientes.';
  bool _hasUnsavedChanges = false;
  bool _syncScheduled = false;
  SyncDraftJob? pendingSyncJob;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    connectivitySub = Connectivity().onConnectivityChanged.listen((results) {
      final hasNetwork = !results.contains(ConnectivityResult.none);
      if (hasNetwork) {
        _scheduleDraftSync();
      }
    });
    _loadTomas();
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    searchTimer?.cancel();
    autoSaveTimer?.cancel();
    connectivitySub?.cancel();
    searchCtrl.dispose();
    searchFocus.dispose();
    for (final node in qtyFocusNodes.values) {
      node.dispose();
    }
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      _scheduleDraftSync();
    }
  }

  Future<void> _loadTomas() async {
    setState(() => loading = true);
    try {
      final data = await widget.api.tomas();
      final historyData = await widget.api.historial();
      if (!mounted) return;
      setState(() {
        tomas = data;
        history = historyData;
      });
    } catch (err) {
      if (err is ApiException && err.statusCode == 401) return;
      _toast('$err', isError: true);
    } finally {
      if (mounted) {
        setState(() => loading = false);
      }
    }
  }

  Future<void> _openToma(Toma toma) async {
    setState(() => loading = true);
    try {
      final conteoId =
          toma.conteoId ?? await widget.api.iniciarConteo(toma.tomaId);
      final detail = await widget.api.detalleConteo(conteoId, toma);
      final localDraft = await widget.store.readDraft(conteoId);
      final syncJob = await widget.store.readSyncJob(conteoId);
      if (!mounted) return;
      setState(() {
        conteo = detail.conteo.copyWith(version: localDraft?.version);
        items = syncJob?.items ?? localDraft?.items ?? detail.items;
        results = [];
        searchCtrl.clear();
        pendingSyncJob = syncJob;
        _hasUnsavedChanges = localDraft != null || syncJob != null;
        saveStatus = _resolveSyncStatus(
          syncJob,
          localDraft != null,
          syncJob?.items ?? localDraft?.items ?? detail.items,
        );
      });
      _startPeriodicAutoSave();
      _scheduleDraftSync();
    } catch (err) {
      _toast('$err', isError: true);
    } finally {
      if (mounted) {
        setState(() => loading = false);
      }
    }
  }

  String _normalizeSearchTerm(String value) =>
      value.trim().replaceAll(RegExp(r'\s+'), ' ').toLowerCase();

  Future<void> _search(String value) async {
    searchTimer?.cancel();
    final term = _normalizeSearchTerm(value);
    if (term.length < 3) {
      setState(() => results = []);
      return;
    }
    searchTimer = Timer(const Duration(milliseconds: 450), () async {
      final cached = await widget.store.readSearch(term);
      if (cached != null) {
        if (mounted) {
          setState(() => results = cached);
        }
        return;
      }
      try {
        final data = await widget.api.searchProducts(term);
        await widget.store.saveSearch(term, data);
        if (mounted) {
          setState(() => results = data);
        }
      } catch (err) {
        _toast('$err', isError: true);
      }
    });
  }

  Future<void> _handleSearchSubmit(String value) async {
    searchTimer?.cancel();
    final term = _normalizeSearchTerm(value);
    if (term.isEmpty) return;

    setState(() => loading = true);
    try {
      final data = await widget.api.searchProducts(term);
      if (mounted) {
        setState(() {
          results = data;
        });
        if (data.isEmpty) {
          _toast('No se encontraron productos.', isWarning: true);
        }
      }
    } catch (err) {
      _toast('$err', isError: true);
    } finally {
      if (mounted) {
        setState(() => loading = false);
      }
    }
  }

  void _addOrIncrementProduct(Product product) {
    final index = items.indexWhere((item) => item.productoId == product.id);
    qtyFocusNodes.putIfAbsent(product.id, FocusNode.new);
    setState(() {
      if (index != -1) {
        _toast(
          'Producto duplicado. Cambie la cantidad si necesita ajustar.',
          isWarning: true,
        );
      } else {
        items = [
          CountItem(
            productoId: product.id,
            codigo: product.codigo,
            descripcion: _shortDescription(product.descripcion),
            cantidad: 0,
          ),
          ...items,
        ];
        saveStatus = 'Cambios pendientes...';
        _hasUnsavedChanges = true;
      }
      results = [];
      searchCtrl.clear();
    });
    if (index == -1) {
      _persistLocalDraft();
    }

    WidgetsBinding.instance.addPostFrameCallback((_) {
      final qtyFocus = qtyFocusNodes[product.id];
      if (qtyFocus != null && qtyFocus.canRequestFocus) {
        qtyFocus.requestFocus();
      }
    });
  }

  void _updateQty(int productoId, String value) {
    final raw = value.trim();
    final qty = int.tryParse(raw);
    setState(() {
      items = items
          .map(
            (item) => item.productoId == productoId
                ? item.copyWith(cantidad: qty != null && qty >= 0 ? qty.toDouble() : item.cantidad)
                : item,
          )
          .toList();
      saveStatus = 'Cambios pendientes...';
      _hasUnsavedChanges = true;
    });
    _persistLocalDraft();
  }

  void _removeItem(int productoId) {
    setState(() {
      items = items.where((item) => item.productoId != productoId).toList();
      saveStatus = 'Cambios pendientes...';
      _hasUnsavedChanges = true;
    });
    qtyFocusNodes.remove(productoId)?.dispose();
    _persistLocalDraft();
  }

  List<CountItem> get validItems =>
      items
          .where(
            (item) =>
                item.cantidad > 0 &&
                item.cantidad.truncateToDouble() == item.cantidad,
          )
          .toList();

  bool get hasInvalidItems => items.any(
    (item) => item.cantidad <= 0 || item.cantidad.truncateToDouble() != item.cantidad,
  );

  Future<void> _persistLocalDraft() async {
    final current = conteo;
    if (current == null) {
      return;
    }
    await widget.store.saveDraft(current.id, current.version, items);
    final job = SyncDraftJob(
      conteoId: current.id,
      version: current.version,
      items: validItems,
      status: 'pending',
      updatedAt: DateTime.now().toIso8601String(),
    );
    await widget.store.saveSyncJob(job);
    if (mounted) {
      setState(() => pendingSyncJob = job);
    }
  }

  void _startPeriodicAutoSave() {
    autoSaveTimer?.cancel();
    autoSaveTimer = Timer.periodic(const Duration(minutes: 3), (timer) {
      _scheduleDraftSync();
    });
  }

  void _scheduleDraftSync() {
    if (_syncScheduled) {
      return;
    }
    if (!_hasUnsavedChanges ||
        conteo == null ||
        validItems.isEmpty ||
        hasInvalidItems ||
        saving) {
      return;
    }
    _syncScheduled = true;
    Future<void>.delayed(const Duration(milliseconds: 250), () async {
      _syncScheduled = false;
      if (!mounted) {
        return;
      }
      if (_hasUnsavedChanges &&
          conteo != null &&
          validItems.isNotEmpty &&
          !hasInvalidItems &&
          !saving) {
        await _saveDraft(silent: true);
      }
    });
  }

  Future<void> _openScanner() async {
    if (conteo == null || loading || saving) {
      return;
    }
    final code = await Navigator.of(context).push<String>(
      MaterialPageRoute(builder: (_) => const BarcodeScannerScreen()),
    );
    if (!mounted || code == null || code.trim().isEmpty) {
      return;
    }
    searchCtrl.text = code.trim();
    await _handleSearchSubmit(code.trim());
  }

  Future<void> _saveDraft({bool silent = false}) async {
    final current = conteo;
    if (current == null || saving) {
      return;
    }
    if (hasInvalidItems) {
      setState(() {
        saveStatus = 'Corrija o elimine productos con cantidad 0 o invalida.';
      });
      if (!silent) {
        _toast(
          'Hay productos con cantidad 0 o invalida. Corrijalos o elimínelos antes de guardar.',
          isWarning: true,
        );
      }
      return;
    }
    if (validItems.isEmpty) {
      if (!silent) {
        _toast('Agregue productos validos al conteo.', isWarning: true);
      }
      return;
    }
    setState(() {
      saving = true;
      saveStatus = 'Guardando borrador...';
    });
    try {
      final version = await widget.api.guardarBorrador(
        current.id,
        current.version,
        validItems,
      );
      await widget.store.clearDraft(current.id);
      await widget.store.clearSyncJob(current.id);
      setState(() {
        conteo = current.copyWith(version: version);
        pendingSyncJob = null;
        saveStatus = 'Borrador guardado.';
        _hasUnsavedChanges = false;
      });
      if (!silent) {
        _toast('Borrador guardado.');
      }
    } catch (err) {
      await _persistLocalDraft();
      final failedJob = SyncDraftJob(
        conteoId: current.id,
        version: current.version,
        items: validItems,
        status: 'error',
        updatedAt: DateTime.now().toIso8601String(),
        errorMessage: '$err',
      );
      await widget.store.saveSyncJob(failedJob);
      if (!mounted) return;
      setState(() {
        pendingSyncJob = failedJob;
        saveStatus = 'Borrador local guardado. Pendiente de sincronizar.';
      });
      if (!silent) {
        _toast('$err', isWarning: true);
      }
    } finally {
      if (mounted) {
        setState(() => saving = false);
      }
    }
  }

  Future<void> _finish() async {
    final current = conteo;
    if (current == null || saving) {
      return;
    }
    if (hasInvalidItems) {
      setState(() {
        saveStatus = 'Corrija o elimine productos con cantidad 0 o invalida.';
      });
      _toast(
        'Hay productos con cantidad 0 o invalida. Corrijalos o elimínelos antes de finalizar.',
        isWarning: true,
      );
      return;
    }
    if (validItems.isEmpty) {
      _toast('Agregue productos validos al conteo.', isWarning: true);
      return;
    }
    setState(() {
      saving = true;
      saveStatus = 'Finalizando conteo...';
    });
    try {
      await widget.api.finalizarConteo(current.id, current.version, validItems);
      await widget.store.clearDraft(current.id);
      await widget.store.clearSyncJob(current.id);
      setState(() {
        conteo = null;
        items = [];
        pendingSyncJob = null;
        saveStatus = 'Sin cambios recientes.';
        _hasUnsavedChanges = false;
      });
      autoSaveTimer?.cancel();
      autoSaveTimer = null;
      await _loadTomas();
      _toast('Conteo finalizado.');
    } catch (err) {
      await _persistLocalDraft();
      _toast('$err', isError: true);
    } finally {
      if (mounted) {
        setState(() => saving = false);
      }
    }
  }

  void _toast(String message, {bool isError = false, bool isWarning = false}) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        backgroundColor: isError ? appRed : (isWarning ? appWarning : appGreen),
        content: Text(message),
      ),
    );
  }

  String _title(String raw) {
    final value = raw.trim();
    if (value.toUpperCase().startsWith('TOMA FISICA #')) {
      return value.toUpperCase().replaceFirst('TOMA FISICA ', '');
    }
    return '# $value'.toUpperCase();
  }

  String _shortDescription(String value) {
    final clean = value.trim();
    if (clean.length <= _maxCountDescription) {
      return clean;
    }
    return clean.substring(0, _maxCountDescription);
  }

  String _period(String date, String hour) {
    final cleanDate = date.length >= 10 ? date.substring(0, 10) : date;
    final cleanHour = hour.length >= 5 ? hour.substring(0, 5) : hour;
    return [cleanDate, cleanHour].where((part) => part.isNotEmpty).join(' ');
  }

  String _resolveSyncStatus(
    SyncDraftJob? job,
    bool hasDraft,
    List<CountItem> sourceItems,
  ) {
    final hasInvalidSourceItems = sourceItems.any(
      (item) => item.cantidad <= 0 || item.cantidad.truncateToDouble() != item.cantidad,
    );
    if (job?.status == 'error') {
      return 'Borrador local con error de sincronizacion.';
    }
    if (hasInvalidSourceItems) {
      return 'Corrija o elimine productos con cantidad 0 o invalida.';
    }
    if (job != null || hasDraft) {
      return 'Borrador local pendiente de sincronizar.';
    }
    return 'Sin cambios recientes.';
  }

  Future<void> _backToTomaList() async {
    await _persistLocalDraft();
    autoSaveTimer?.cancel();
    autoSaveTimer = null;
    setState(() {
      conteo = null;
      items = [];
      results = [];
      searchCtrl.clear();
      saveStatus = 'Sin cambios recientes.';
      _hasUnsavedChanges = false;
    });
    await _loadTomas();
  }

  @override
  Widget build(BuildContext context) {
    final current = conteo;
    return Scaffold(
      appBar: AppBar(
        backgroundColor: Colors.white,
        surfaceTintColor: Colors.white,
        leading: current == null
            ? null
            : IconButton(
                tooltip: 'Volver',
                onPressed: _backToTomaList,
                icon: const Icon(Icons.arrow_back, color: appBlue),
              ),
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              widget.branding.brandName,
              style: const TextStyle(
                color: appBlue,
                fontSize: 11,
                fontWeight: FontWeight.w800,
              ),
            ),
            Text(
              current == null ? widget.user.nombre : _title(current.numeroToma),
              style: const TextStyle(
                color: appBlue,
                fontSize: 14,
                fontWeight: FontWeight.w900,
              ),
            ),
          ],
        ),
        actions: [
          if (kDebugMode)
            ApiSettingsIconButton(
              apiBaseUrl: widget.apiBaseUrl,
              onChanged: widget.onApiBaseUrlChanged,
            ),
          IconButton(
            tooltip: 'Salir',
            onPressed: widget.onLogout,
            icon: const Icon(Icons.account_circle_outlined, color: appBlue),
          ),
        ],
      ),
      body: loading
          ? const Center(child: CircularProgressIndicator())
          : current == null
          ? _buildTomaList()
          : _buildCount(current),
      bottomNavigationBar: (loading || current == null)
          ? null
          : SafeArea(
              child: Container(
                color: Colors.white,
                padding: const EdgeInsets.symmetric(
                  horizontal: 16,
                  vertical: 10,
                ),
                child: OutlinedButton.icon(
                  onPressed: saving || validItems.isEmpty
                      ? null
                      : () => _saveDraft(),
                  icon: const Icon(Icons.save_outlined),
                  label: const Text('Guardar borrador'),
                  style: OutlinedButton.styleFrom(
                    foregroundColor: appBlue,
                    padding: const EdgeInsets.symmetric(vertical: 14),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(6),
                    ),
                    side: const BorderSide(color: appPrimary),
                  ),
                ),
              ),
            ),
    );
  }

  Widget _buildTomaList() {
    return RefreshIndicator(
      onRefresh: _loadTomas,
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          const PageHeading(
            kicker: 'CONTEO FISICO',
            title: 'Seleccionar conteo',
          ),
          const SizedBox(height: 12),
          CardBox(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                const Text(
                  'Conteos disponibles',
                  style: TextStyle(
                    color: appBlue,
                    fontSize: 13,
                    fontWeight: FontWeight.w900,
                  ),
                ),
                const SizedBox(height: 12),
                if (tomas.isEmpty)
                  const Text('No hay tomas abiertas asignadas.'),
                ...tomas.map(
                  (toma) => Padding(
                    padding: const EdgeInsets.only(bottom: 10),
                    child: InkWell(
                      borderRadius: BorderRadius.circular(6),
                      onTap: () => _openToma(toma),
                      child: Container(
                        padding: const EdgeInsets.all(16),
                        decoration: BoxDecoration(
                          color: Colors.white,
                          border: Border.all(color: appBorder),
                          borderRadius: BorderRadius.circular(6),
                        ),
                        child: Row(
                          children: [
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(
                                    _title(toma.numeroToma),
                                    style: const TextStyle(
                                      color: appBlue,
                                      fontSize: 13,
                                      fontWeight: FontWeight.w900,
                                    ),
                                  ),
                                  const SizedBox(height: 6),
                                  Text(
                                    'AGENCIA: ${toma.agencia}',
                                    style: const TextStyle(
                                      color: appBlue,
                                      fontSize: 12,
                                      fontWeight: FontWeight.w800,
                                    ),
                                  ),
                                  Text(
                                    'HABILITACION: ${_period(toma.fechaHabilitacion, toma.horaInicio)}',
                                    style: const TextStyle(
                                      color: appBlue,
                                      fontSize: 12,
                                      fontWeight: FontWeight.w800,
                                    ),
                                  ),
                                  Text(
                                    'FINALIZACION: ${_period(toma.fechaCierre, toma.horaFin)}',
                                    style: const TextStyle(
                                      color: appBlue,
                                      fontSize: 12,
                                      fontWeight: FontWeight.w800,
                                    ),
                                  ),
                                  const SizedBox(height: 8),
                                  Text(
                                    '${toma.lineas} lineas registradas - ${toma.conteoId == null ? 'Empezar' : 'Continuar'}',
                                  ),
                                ],
                              ),
                            ),
                            const Icon(
                              Icons.arrow_circle_right_outlined,
                              color: appBlue,
                              size: 28,
                            ),
                          ],
                        ),
                      ),
                    ),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 14),
          CardBox(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                const Text(
                  'Historial de conteos',
                  style: TextStyle(
                    color: appBlue,
                    fontSize: 13,
                    fontWeight: FontWeight.w900,
                  ),
                ),
                const SizedBox(height: 12),
                if (history.isEmpty)
                  const Text('Todavia no hay conteos registrados.'),
                ...history.map(
                  (item) => Container(
                    margin: const EdgeInsets.only(bottom: 9),
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      color: Colors.white,
                      border: Border.all(color: appBorder),
                      borderRadius: BorderRadius.circular(6),
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          _title(item.numeroToma),
                          style: const TextStyle(
                            color: appBlue,
                            fontWeight: FontWeight.w900,
                          ),
                        ),
                        const SizedBox(height: 4),
                        Text(
                          'AGENCIA: ${item.agencia.isEmpty ? '-' : item.agencia}',
                        ),
                        Text(
                          '${item.estado.toUpperCase()} - ${item.lineas} lineas - ${item.unidades.toStringAsFixed(2)} unidades',
                        ),
                        if (item.fecha.isNotEmpty)
                          Text(
                            item.fecha,
                            style: const TextStyle(
                              color: Colors.black54,
                              fontSize: 12,
                            ),
                          ),
                      ],
                    ),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildCount(ConteoInfo current) {
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        CardBox(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Row(
                children: const [
                  Icon(Icons.play_circle_fill, color: appGreen, size: 14),
                  SizedBox(width: 6),
                  Text(
                    'OPERACION ACTIVA',
                    style: TextStyle(
                      color: appBlue,
                      fontSize: 12,
                      fontWeight: FontWeight.w900,
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 10),
              Text(
                _title(current.numeroToma),
                style: const TextStyle(
                  color: appBlue,
                  fontSize: 16,
                  fontWeight: FontWeight.w900,
                ),
              ),
              const SizedBox(height: 8),
              Text(
                saveStatus,
                style: const TextStyle(
                  color: Colors.black87,
                  fontSize: 12,
                  fontWeight: FontWeight.w600,
                ),
              ),
              const SizedBox(height: 14),
              FilledButton.icon(
                onPressed: saving || validItems.isEmpty ? null : _finish,
                icon: const Icon(Icons.check_circle_outline),
                label: const Text('Finalizar conteo'),
                style: FilledButton.styleFrom(
                  backgroundColor: appGreen,
                  padding: const EdgeInsets.symmetric(vertical: 15),
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(6),
                  ),
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: 14),
        CardBox(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text('Buscar producto'),
              const SizedBox(height: 8),
              Row(
                children: [
                  Expanded(
                    child: TextField(
                      controller: searchCtrl,
                      focusNode: searchFocus,
                      style: const TextStyle(fontSize: 13),
                      decoration: const InputDecoration(
                        hintText: 'Codigo o descripcion',
                        prefixIcon: Icon(Icons.search),
                      ),
                      onChanged: _search,
                      onSubmitted: _handleSearchSubmit,
                    ),
                  ),
                  const SizedBox(width: 8),
                  SizedBox(
                    width: 48,
                    height: 48,
                    child: FilledButton.tonal(
                      onPressed: _openScanner,
                      style: FilledButton.styleFrom(
                        padding: EdgeInsets.zero,
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(6),
                        ),
                      ),
                      child: const Icon(Icons.qr_code_scanner_outlined),
                    ),
                  ),
                ],
              ),
              if (results.isNotEmpty)
                Container(
                  margin: const EdgeInsets.only(top: 8),
                  decoration: BoxDecoration(
                    color: Colors.white,
                    border: Border.all(color: appBorder),
                    borderRadius: BorderRadius.circular(6),
                  ),
                  child: Column(
                    children: results
                        .map(
                          (product) => ListTile(
                            dense: true,
                            title: Text(
                              product.codigo,
                              style: const TextStyle(
                                color: appBlue,
                                fontSize: 12,
                                fontWeight: FontWeight.w900,
                              ),
                            ),
                            subtitle: Text(
                              _shortDescription(product.descripcion),
                              maxLines: 2,
                              overflow: TextOverflow.ellipsis,
                              style: const TextStyle(fontSize: 12),
                            ),
                            trailing: const Icon(
                              Icons.add_circle_outline,
                              color: appPrimary,
                            ),
                            onTap: () => _addOrIncrementProduct(product),
                          ),
                        )
                        .toList(),
                  ),
                ),
            ],
          ),
        ),
        const SizedBox(height: 14),
        CardBox(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Row(
                children: [
                  const Expanded(
                    child: Text(
                      'Productos contados',
                      style: TextStyle(
                        color: appBlue,
                        fontSize: 13,
                        fontWeight: FontWeight.w900,
                      ),
                    ),
                  ),
                  Chip(
                    label: Text('${items.length}'),
                    backgroundColor: const Color(0xffdcecff),
                    side: BorderSide.none,
                  ),
                ],
              ),
              const SizedBox(height: 8),
              if (items.isEmpty)
                const Padding(
                  padding: EdgeInsets.symmetric(vertical: 28),
                  child: Center(
                    child: Text('Agregue productos para iniciar el conteo.'),
                  ),
                ),
              ...items.map((item) {
                final qtyFocus = qtyFocusNodes.putIfAbsent(
                  item.productoId,
                  FocusNode.new,
                );
                return Container(
                  margin: const EdgeInsets.only(bottom: 10),
                  padding: const EdgeInsets.all(10),
                  decoration: BoxDecoration(
                    color: Colors.white,
                    border: Border.all(color: appBorder),
                    borderRadius: BorderRadius.circular(6),
                  ),
                  child: Row(
                    children: [
                      IconButton(
                        onPressed: () => _removeItem(item.productoId),
                        icon: const Icon(Icons.delete_outline, color: appRed),
                      ),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              item.codigo,
                              style: const TextStyle(
                                color: appBlue,
                                fontSize: 12,
                                fontWeight: FontWeight.w900,
                              ),
                            ),
                            Text(
                              _shortDescription(item.descripcion),
                              maxLines: 2,
                              overflow: TextOverflow.ellipsis,
                              style: const TextStyle(
                                fontSize: 12,
                                fontWeight: FontWeight.w700,
                              ),
                            ),
                          ],
                        ),
                      ),
                      const SizedBox(width: 8),
                      SizedBox(
                        width: 78,
                        child: TextFormField(
                          key: ValueKey('${item.productoId}-${item.cantidad}'),
                          focusNode: qtyFocus,
                          style: const TextStyle(fontSize: 13),
                          initialValue: item.cantidad <= 0
                              ? '0'
                              : item.cantidad.toStringAsFixed(
                                  item.cantidad.truncateToDouble() ==
                                          item.cantidad
                                      ? 0
                                      : 2,
                                ),
                          textAlign: TextAlign.center,
                          keyboardType: const TextInputType.numberWithOptions(
                            decimal: false,
                          ),
                          inputFormatters: [
                            FilteringTextInputFormatter.allow(
                              RegExp(r'^\d*$'),
                            ),
                          ],
                          decoration: const InputDecoration(
                            contentPadding: EdgeInsets.symmetric(
                              horizontal: 8,
                              vertical: 10,
                            ),
                            hintText: '0',
                          ),
                          onChanged: (value) =>
                              _updateQty(item.productoId, value),
                        ),
                      ),
                    ],
                  ),
                );
              }),
            ],
          ),
        ),
      ],
    );
  }
}
