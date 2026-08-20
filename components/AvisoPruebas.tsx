/**
 * Aviso de ensayo en el formulario.
 *
 * Existe por una razón concreta y no por prolijidad: mientras el equipo prueba
 * en producción, el sitio está abierto para cualquiera que llegue por la URL o
 * por un QR ya impreso. Sin este aviso, alguien de paso entregaría su nombre,
 * su RUT y su correo creyendo que entra a un sorteo que no se va a hacer, y su
 * fila se borra después con la limpieza. Decirlo en la misma pantalla donde se
 * pide el dato es la diferencia entre un ensayo y un engaño.
 *
 * Solo se pinta con el modo pruebas encendido desde /admin. En la activación
 * real no existe: no es una marca de borrador, es un estado operativo.
 */
export function AvisoPruebas() {
  return (
    <p role="status" style={estilo}>
      <strong style={{ letterSpacing: ".08em" }}>ESTAMOS PROBANDO.</strong>{" "}
      Las inscripciones de ahora no entran a ningún sorteo y se borran al
      terminar la prueba. Vuelve cuando arranque el concurso.
    </p>
  );
}

const estilo: React.CSSProperties = {
  margin: 0,
  padding: "10px 13px",
  borderRadius: 4,
  // El mismo rojo de marca que usa el panel para lo que hay que leer sí o sí,
  // sobre un fondo apenas teñido: tiene que verse antes que el primer campo sin
  // competir con el titular de la campaña.
  background: "rgba(255, 57, 0, .14)",
  border: "1px solid rgba(255, 57, 0, .55)",
  color: "#FFFFFF",
  fontSize: 13,
  lineHeight: 1.5,
};
