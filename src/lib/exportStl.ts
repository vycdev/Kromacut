// Binary STL exporter for three.js meshes (Kromacut)
// Exports the mesh's geometry (respecting current scale) into a binary STL Blob.
// Progress callback receives values in [0,1].
import type * as THREE from 'three';

export async function exportMeshToStlBlob(
    mesh: THREE.Mesh,
    onProgress?: (p: number) => void
): Promise<Blob> {
    const geometry = mesh.geometry as THREE.BufferGeometry;
    const pos = geometry.getAttribute('position');
    if (!pos) throw new Error('No geometry position attribute to export');
    // ensure normals to have stable facet normals; computing if absent
    try {
        geometry.computeVertexNormals();
    } catch {
        /* ignore */
    }
    const index = geometry.getIndex();
    const sx = mesh.scale.x;
    const sy = mesh.scale.y;
    const sz = mesh.scale.z;

    const getTri = (a: number, b: number, c: number) => {
        const ax = pos.getX(a),
            ay = pos.getY(a),
            az = pos.getZ(a);
        const bx = pos.getX(b),
            by = pos.getY(b),
            bz = pos.getZ(b);
        const cx = pos.getX(c),
            cy = pos.getY(c),
            cz = pos.getZ(c);
        const ux = bx - ax,
            uy = by - ay,
            uz = bz - az;
        const vx = cx - ax,
            vy = cy - ay,
            vz = cz - az;
        let nx = uy * vz - uz * vy;
        let ny = uz * vx - ux * vz;
        let nz = ux * vy - uy * vx;
        const len = Math.hypot(nx, ny, nz) || 1;
        nx /= len;
        ny /= len;
        nz /= len;
        return { ax, ay, az, bx, by, bz, cx, cy, cz, nx, ny, nz };
    };

    const totalTris = index ? index.count / 3 : pos.count / 3;
    const headerBytes = 80;
    const triSize = 50; // 12 bytes normal, 9*4 bytes vertices, 2 bytes attribute
    const totalBytes = headerBytes + 4 + totalTris * triSize;
    let buffer: ArrayBuffer;
    try {
        buffer = new ArrayBuffer(totalBytes);
    } catch {
        throw new Error('Allocation failed for binary STL buffer');
    }
    const view = new DataView(buffer);
    const headerStr = 'Kromacut Binary STL';
    for (let i = 0; i < headerStr.length && i < 80; i++) view.setUint8(i, headerStr.charCodeAt(i));
    view.setUint32(headerBytes, totalTris, true);

    const CHUNK = 20000;
    let offset = headerBytes + 4;
    const sx_f = sx,
        sy_f = sy,
        sz_f = sz;
    const writeTri = (t: ReturnType<typeof getTri>) => {
        view.setFloat32(offset + 0, t.nx, true);
        view.setFloat32(offset + 4, t.ny, true);
        view.setFloat32(offset + 8, t.nz, true);
        view.setFloat32(offset + 12, t.ax * sx_f, true);
        view.setFloat32(offset + 16, t.ay * sy_f, true);
        view.setFloat32(offset + 20, t.az * sz_f, true);
        view.setFloat32(offset + 24, t.bx * sx_f, true);
        view.setFloat32(offset + 28, t.by * sy_f, true);
        view.setFloat32(offset + 32, t.bz * sz_f, true);
        view.setFloat32(offset + 36, t.cx * sx_f, true);
        view.setFloat32(offset + 40, t.cy * sy_f, true);
        view.setFloat32(offset + 44, t.cz * sz_f, true);
        view.setUint16(offset + 48, 0, true);
        offset += triSize;
    };

    if (index) {
        for (let i = 0, tri = 0; i < index.count; i += 3, tri++) {
            const a = index.getX(i),
                b = index.getX(i + 1),
                c = index.getX(i + 2);
            writeTri(getTri(a, b, c));
            if (tri % CHUNK === 0 && onProgress) {
                onProgress(tri / totalTris);
                await new Promise((r) => setTimeout(r, 0));
            }
        }
    } else {
        for (let i = 0, tri = 0; i < pos.count; i += 3, tri++) {
            writeTri(getTri(i, i + 1, i + 2));
            if (tri % CHUNK === 0 && onProgress) {
                onProgress(tri / totalTris);
                await new Promise((r) => setTimeout(r, 0));
            }
        }
    }
    if (onProgress) onProgress(1);
    return new Blob([buffer], { type: 'model/stl' });
}

export default exportMeshToStlBlob;
