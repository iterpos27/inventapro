class SessionUser {
  const SessionUser({
    required this.id,
    required this.nombre,
    required this.usuario,
    required this.rol,
  });

  final int id;
  final String nombre;
  final String usuario;
  final String rol;

  factory SessionUser.fromJson(Map<String, dynamic> json) {
    return SessionUser(
      id: int.tryParse('${json['id']}') ?? 0,
      nombre: '${json['nombre'] ?? ''}',
      usuario: '${json['usuario'] ?? ''}',
      rol: '${json['rol'] ?? ''}',
    );
  }

  Map<String, dynamic> toJson() => {
    'id': id,
    'nombre': nombre,
    'usuario': usuario,
    'rol': rol,
  };
}

class CountSession {
  const CountSession({required this.token, required this.user});

  final String token;
  final SessionUser user;
}

class Toma {
  const Toma({
    required this.tomaId,
    required this.numeroToma,
    required this.agencia,
    required this.fechaHabilitacion,
    required this.fechaCierre,
    required this.horaInicio,
    required this.horaFin,
    this.conteoId,
    this.lineas = 0,
  });

  final int tomaId;
  final int? conteoId;
  final String numeroToma;
  final String agencia;
  final String fechaHabilitacion;
  final String fechaCierre;
  final String horaInicio;
  final String horaFin;
  final int lineas;

  factory Toma.fromJson(Map<String, dynamic> json) {
    return Toma(
      tomaId: int.tryParse('${json['toma_id']}') ?? 0,
      conteoId: json['conteo_id'] == null
          ? null
          : int.tryParse('${json['conteo_id']}'),
      numeroToma: '${json['numero_toma'] ?? json['nombre_toma'] ?? ''}',
      agencia: '${json['agencia'] ?? ''}',
      fechaHabilitacion: '${json['fecha_habilitacion'] ?? ''}',
      fechaCierre: '${json['fecha_cierre'] ?? ''}',
      horaInicio: '${json['hora_inicio'] ?? ''}',
      horaFin: '${json['hora_fin'] ?? ''}',
      lineas: int.tryParse('${json['lineas'] ?? 0}') ?? 0,
    );
  }
}

class ConteoInfo {
  const ConteoInfo({
    required this.id,
    required this.version,
    required this.numeroToma,
    required this.agencia,
    required this.fechaHabilitacion,
    required this.fechaCierre,
    required this.horaInicio,
    required this.horaFin,
    required this.estado,
  });

  final int id;
  final int version;
  final String numeroToma;
  final String agencia;
  final String fechaHabilitacion;
  final String fechaCierre;
  final String horaInicio;
  final String horaFin;
  final String estado;

  ConteoInfo copyWith({int? version, String? estado}) {
    return ConteoInfo(
      id: id,
      version: version ?? this.version,
      numeroToma: numeroToma,
      agencia: agencia,
      fechaHabilitacion: fechaHabilitacion,
      fechaCierre: fechaCierre,
      horaInicio: horaInicio,
      horaFin: horaFin,
      estado: estado ?? this.estado,
    );
  }

  factory ConteoInfo.fromJson(Map<String, dynamic> json) {
    return ConteoInfo(
      id: int.tryParse('${json['id'] ?? json['conteo_id']}') ?? 0,
      version:
          int.tryParse('${json['version'] ?? json['conteo_version'] ?? 0}') ??
          0,
      numeroToma: '${json['numero_toma'] ?? json['nombre_toma'] ?? ''}',
      agencia: '${json['agencia'] ?? ''}',
      fechaHabilitacion: '${json['fecha_habilitacion'] ?? ''}',
      fechaCierre: '${json['fecha_cierre'] ?? ''}',
      horaInicio: '${json['hora_inicio'] ?? ''}',
      horaFin: '${json['hora_fin'] ?? ''}',
      estado: '${json['estado'] ?? 'borrador'}',
    );
  }
}

class CountHistory {
  const CountHistory({
    required this.id,
    required this.numeroToma,
    required this.agencia,
    required this.estado,
    required this.lineas,
    required this.unidades,
    required this.fecha,
  });

  final int id;
  final String numeroToma;
  final String agencia;
  final String estado;
  final int lineas;
  final double unidades;
  final String fecha;

  factory CountHistory.fromJson(Map<String, dynamic> json) {
    return CountHistory(
      id: int.tryParse('${json['id']}') ?? 0,
      numeroToma: '${json['numero_toma'] ?? json['nombre_toma'] ?? ''}',
      agencia: '${json['agencia'] ?? ''}',
      estado: '${json['estado'] ?? ''}',
      lineas: int.tryParse('${json['lineas'] ?? 0}') ?? 0,
      unidades: double.tryParse('${json['unidades'] ?? 0}') ?? 0,
      fecha: '${json['fecha_finalizacion'] ?? json['fecha_inicio'] ?? ''}',
    );
  }
}

class Product {
  const Product({
    required this.id,
    required this.codigo,
    required this.descripcion,
  });

  final int id;
  final String codigo;
  final String descripcion;

  factory Product.fromJson(Map<String, dynamic> json) {
    return Product(
      id: int.tryParse('${json['id'] ?? json['producto_id']}') ?? 0,
      codigo: '${json['codigo'] ?? ''}',
      descripcion: '${json['descripcion'] ?? ''}',
    );
  }
}

class CountItem {
  const CountItem({
    required this.productoId,
    required this.codigo,
    required this.descripcion,
    required this.cantidad,
  });

  final int productoId;
  final String codigo;
  final String descripcion;
  final double cantidad;

  CountItem copyWith({double? cantidad}) {
    return CountItem(
      productoId: productoId,
      codigo: codigo,
      descripcion: descripcion,
      cantidad: cantidad ?? this.cantidad,
    );
  }

  factory CountItem.fromJson(Map<String, dynamic> json) {
    return CountItem(
      productoId: int.tryParse('${json['producto_id'] ?? json['id']}') ?? 0,
      codigo: '${json['codigo'] ?? ''}',
      descripcion: '${json['descripcion'] ?? ''}',
      cantidad: double.tryParse('${json['cantidad'] ?? 0}') ?? 0,
    );
  }

  Map<String, dynamic> toJson() => {
    'producto_id': productoId,
    'codigo': codigo,
    'descripcion': descripcion,
    'cantidad': cantidad,
  };
}
