import { rgbToHex, rgbToLab, type Lab, type Rgb } from "./color";

export interface DominantColor {
  hex: string;
  /** Proporción de píxeles del cluster, 0–1. */
  share: number;
}

/** Lado máximo al que se reduce la imagen antes de leer píxeles. */
const SAMPLE_SIZE = 140;
const MAX_ITERATIONS = 12;

interface Sample {
  rgb: Rgb;
  lab: Lab;
}

async function loadImage(file: File): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    await new Promise<void>((resolve, reject) => {
      image.onload = () => {
        resolve();
      };
      image.onerror = () => {
        reject(new Error("No se pudo leer la imagen."));
      };
      image.src = url;
    });
    return image;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function samplePixels(image: HTMLImageElement): Sample[] {
  const scale = Math.min(1, SAMPLE_SIZE / Math.max(image.width, image.height));
  const width = Math.max(1, Math.round(image.width * scale));
  const height = Math.max(1, Math.round(image.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("El navegador no permite leer la imagen.");

  context.drawImage(image, 0, 0, width, height);
  const { data } = context.getImageData(0, 0, width, height);

  const samples: Sample[] = [];
  for (let i = 0; i < data.length; i += 4) {
    const alpha = data[i + 3] ?? 0;
    // Los recortes de miniatura suelen venir con fondo transparente.
    if (alpha < 200) continue;

    const rgb: Rgb = { r: data[i] ?? 0, g: data[i + 1] ?? 0, b: data[i + 2] ?? 0 };
    samples.push({ rgb, lab: rgbToLab(rgb) });
  }

  return samples;
}

function labDistance(a: Lab, b: Lab): number {
  return (a.l - b.l) ** 2 + (a.a - b.a) ** 2 + (a.b - b.b) ** 2;
}

/**
 * k-means en Lab. Se agrupa en Lab y no en RGB porque los clusters deben
 * separarse como los ve el ojo: si no, un rojo oscuro y un marrón caen juntos
 * y la foto devuelve un solo color turbio en vez de los dos reales.
 */
function kMeans(samples: Sample[], k: number): DominantColor[] {
  if (samples.length === 0) return [];

  const effectiveK = Math.min(k, samples.length);

  // Inicialización tipo k-means++: el primer centro al azar y cada siguiente
  // lo más lejos posible de los ya elegidos. Evita clusters duplicados.
  const centers: Lab[] = [samples[0]!.lab];
  while (centers.length < effectiveK) {
    let best = samples[0]!;
    let bestDistance = -1;

    for (const sample of samples) {
      const nearest = Math.min(
        ...centers.map((center) => labDistance(sample.lab, center)),
      );
      if (nearest > bestDistance) {
        bestDistance = nearest;
        best = sample;
      }
    }
    centers.push(best.lab);
  }

  let assignments = new Array<number>(samples.length).fill(0);

  for (let iteration = 0; iteration < MAX_ITERATIONS; iteration += 1) {
    let moved = false;

    samples.forEach((sample, index) => {
      let bestCluster = 0;
      let bestDistance = Number.POSITIVE_INFINITY;

      centers.forEach((center, cluster) => {
        const distance = labDistance(sample.lab, center);
        if (distance < bestDistance) {
          bestDistance = distance;
          bestCluster = cluster;
        }
      });

      if (assignments[index] !== bestCluster) moved = true;
      assignments[index] = bestCluster;
    });

    for (let cluster = 0; cluster < centers.length; cluster += 1) {
      const members = samples.filter((_, index) => assignments[index] === cluster);
      if (members.length === 0) continue;

      centers[cluster] = {
        l: members.reduce((sum, s) => sum + s.lab.l, 0) / members.length,
        a: members.reduce((sum, s) => sum + s.lab.a, 0) / members.length,
        b: members.reduce((sum, s) => sum + s.lab.b, 0) / members.length,
      };
    }

    if (!moved) break;
  }

  // El color representativo es la media en RGB de los miembros del cluster, no
  // el centro en Lab: así el hex que se muestra existe de verdad en la foto.
  return centers
    .map((_, cluster) => {
      const members = samples.filter((_, index) => assignments[index] === cluster);
      if (members.length === 0) return null;

      const mean: Rgb = {
        r: members.reduce((sum, s) => sum + s.rgb.r, 0) / members.length,
        g: members.reduce((sum, s) => sum + s.rgb.g, 0) / members.length,
        b: members.reduce((sum, s) => sum + s.rgb.b, 0) / members.length,
      };

      return { hex: rgbToHex(mean), share: members.length / samples.length };
    })
    .filter((color): color is DominantColor => color !== null)
    .sort((a, b) => b.share - a.share);
}

export async function extractDominantColors(
  file: File,
  count = 6,
): Promise<DominantColor[]> {
  const image = await loadImage(file);
  return kMeans(samplePixels(image), count);
}
