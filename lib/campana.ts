/**
 * Datos de la activación que aparecen en más de una superficie.
 *
 * Viven acá y no escritos en cada vista por lo mismo que `textoCierre` vive en
 * lib/concurso.ts: la confirmación existe en dos versiones —el modal de
 * escritorio y la ruta /listo— y un premio que diga una cosa en una y otra en la
 * otra es peor que uno impreciso, porque la persona ve uno u otro según cómo
 * llegó y no hay forma de saber cuál.
 *
 * Son constantes y no variables de entorno, al contrario que las fechas: una
 * fecha se mueve durante la activación y hay que poder cambiarla sin desplegar,
 * pero el premio y la sede son lo que la campaña ES. Si cambian, cambia también
 * el copy alrededor y eso ya es un commit.
 */

/** Nombre completo del premio, tal como se anuncia. */
export const PREMIO = "Perfume Eau de Confianza";

/**
 * Dónde está la activación: los paneles con el QR.
 *
 * Es la sede del stand y de la mesa de premiación. Se mantiene como constante
 * de campaña; el folio, no el texto de esta constante, es la prueba de entrega.
 */
export const SEDE = "Costanera Center";
