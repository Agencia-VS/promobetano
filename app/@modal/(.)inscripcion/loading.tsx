import "@/styles/esqueleto.css";

/**
 * Esqueleto del modal.
 *
 * No es decoración: es lo que vuelve útil el prefetch. La doc de Next 16 dice
 * que en una ruta dinámica el <Link> prefetchea «hasta el segmento más cercano
 * con un loading.js». Sin este archivo no hay frontera que prefetchear, así que
 * al tocar el botón el router se quedaba bloqueado esperando al servidor sin
 * pintar nada —y ese servidor esperaba a su vez ~120 ms a Supabase.
 *
 * Las cajas replican las medidas reales del formulario para que al llegar el
 * contenido no salte la maqueta. El <h2> existe porque el diálogo declara
 * aria-labelledby="modal-titulo": sin un elemento con ese id, mientras carga el
 * lector de pantalla anunciaría un diálogo sin nombre.
 */
export default function CargandoModal() {
  return (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <span className="esq esq--circulo" style={{ width: 26, height: 26 }} />
        <span className="esq" style={{ width: 92, height: 11 }} />
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <h2
          id="modal-titulo"
          style={{ margin: 0, fontSize: 0, lineHeight: 0, color: "transparent" }}
        >
          Cargando la inscripción
        </h2>
        <span className="esq" style={{ width: "88%", height: 26 }} />
        <span className="esq" style={{ width: "62%", height: 26 }} />
        <span className="esq" style={{ width: "70%", height: 13, marginTop: 6 }} />
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            style={{ display: "flex", flexDirection: "column", gap: 7 }}
          >
            <span className="esq" style={{ width: 84, height: 10 }} />
            <span className="esq" style={{ height: 52, borderRadius: 4 }} />
          </div>
        ))}

        {[0, 1].map((i) => (
          <div
            key={i}
            style={{ display: "flex", gap: 12, alignItems: "flex-start" }}
          >
            <span
              className="esq"
              style={{ width: 22, height: 22, flexShrink: 0, borderRadius: 3 }}
            />
            <span className="esq" style={{ height: 30 }} />
          </div>
        ))}

        <span className="esq" style={{ height: 56, borderRadius: 4 }} />
      </div>
    </>
  );
}
