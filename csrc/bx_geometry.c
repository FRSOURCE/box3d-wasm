// Mesh and height field geometry: shared, immutable collision data created
// from JS arrays, then attached to static bodies as shapes.
#include "bx.h"

#include <stdlib.h>
#include <string.h>

static b3Vec3 bxVec3( float x, float y, float z )
{
	b3Vec3 v = { x, y, z };
	return v;
}

static int bxNewResource( int kind, void* ptr )
{
	int slot = bxTable_Alloc( &bx_resources );
	bxResource* resource = bxTable_Get( &bx_resources, slot );
	resource->ptr = ptr;
	resource->kind = kind;
	resource->alive = 1;
	return slot;
}

enum bxMeshFlags
{
	BX_MESH_WELD = 1,
	BX_MESH_MEDIAN_SPLIT = 2,
	BX_MESH_IDENTIFY_EDGES = 4,
	BX_MESH_CLOCKWISE = 8,
};

/// vertices: xyz triples, indices: 3 per triangle, both in wasm memory. Returns 0 on failure.
BX_EXPORT int bx_CreateMesh( const float* vertices, int vertexCount, const int* indices, int triangleCount, int flags,
							 float weldTolerance, const unsigned char* materialIndices )
{
	if ( vertices == NULL || indices == NULL || vertexCount < 3 || triangleCount < 1 )
	{
		return 0;
	}
	b3MeshDef def = { 0 };
	def.vertices = (b3Vec3*)vertices;
	def.stride = 0;
	def.indices = (int32_t*)indices;
	def.materialIndices = (uint8_t*)materialIndices;
	def.weldTolerance = weldTolerance;
	def.vertexCount = vertexCount;
	def.triangleCount = triangleCount;
	def.weldVertices = ( flags & BX_MESH_WELD ) != 0;
	def.useMedianSplit = ( flags & BX_MESH_MEDIAN_SPLIT ) != 0;
	def.identifyEdges = ( flags & BX_MESH_IDENTIFY_EDGES ) != 0;
	def.clockWiseWinding = ( flags & BX_MESH_CLOCKWISE ) != 0;
	b3MeshData* mesh = b3CreateMesh( &def, NULL, 0 );
	if ( mesh == NULL )
	{
		return 0;
	}
	return bxNewResource( BX_RESOURCE_MESH, mesh );
}

/// heights: countX * countZ floats, holes: (countX - 1) * (countZ - 1) bytes or NULL (0xFF marks a hole).
BX_EXPORT int bx_CreateHeightField( const float* heights, const unsigned char* materialIndices, int countX, int countZ, float sx,
									float sy, float sz, float minHeight, float maxHeight, int clockwise )
{
	if ( heights == NULL || countX < 2 || countZ < 2 )
	{
		return 0;
	}
	b3HeightFieldDef def = { 0 };
	def.heights = (float*)heights;
	def.materialIndices = (uint8_t*)materialIndices;
	def.scale = bxVec3( sx, sy, sz );
	def.countX = countX;
	def.countZ = countZ;
	def.globalMinimumHeight = minHeight;
	def.globalMaximumHeight = maxHeight;
	def.clockwiseWinding = clockwise != 0;
	b3HeightFieldData* data = b3CreateHeightField( &def );
	if ( data == NULL )
	{
		return 0;
	}
	return bxNewResource( BX_RESOURCE_HEIGHT_FIELD, data );
}

static int bxAttachResource( int body, int resourceSlot, int kind, int* outSlot, b3ShapeDef* def )
{
	(void)def;
	b3BodyId bodyId = bxBodyId( body );
	bxResource* resource = bxTable_Get( &bx_resources, resourceSlot );
	if ( B3_IS_NULL( bodyId ) || resource == NULL || resource->alive == 0 || resource->released || resource->kind != kind )
	{
		return 0;
	}
	*outSlot = bxTable_Alloc( &bx_shapes );
	return 1;
}

static int bxFinishResourceShape( int slot, int body, int resourceSlot, b3ShapeId id )
{
	if ( B3_IS_NULL( id ) )
	{
		bxTable_Free( &bx_shapes, slot );
		return 0;
	}
	bxShape* shape = bxTable_Get( &bx_shapes, slot );
	shape->id = id;
	shape->body = body;
	shape->alive = 1;
	shape->resource = resourceSlot;
	bxResource* resource = bxTable_Get( &bx_resources, resourceSlot );
	resource->refs += 1;
	return slot;
}

b3ShapeDef bxReadShapeDefPublic( int slot );

BX_EXPORT int bx_CreateMeshShape( int body, int resourceSlot, float sx, float sy, float sz )
{
	int slot = 0;
	b3ShapeDef def;
	if ( bxAttachResource( body, resourceSlot, BX_RESOURCE_MESH, &slot, &def ) == 0 )
	{
		return 0;
	}
	def = bxReadShapeDefPublic( slot );
	bxResource* resource = bxTable_Get( &bx_resources, resourceSlot );
	b3ShapeId id = b3CreateMeshShape( bxBodyId( body ), &def, (const b3MeshData*)resource->ptr, bxVec3( sx, sy, sz ) );
	return bxFinishResourceShape( slot, body, resourceSlot, id );
}

BX_EXPORT int bx_CreateHeightFieldShape( int body, int resourceSlot )
{
	int slot = 0;
	b3ShapeDef def;
	if ( bxAttachResource( body, resourceSlot, BX_RESOURCE_HEIGHT_FIELD, &slot, &def ) == 0 )
	{
		return 0;
	}
	def = bxReadShapeDefPublic( slot );
	bxResource* resource = bxTable_Get( &bx_resources, resourceSlot );
	b3ShapeId id = b3CreateHeightFieldShape( bxBodyId( body ), &def, (const b3HeightFieldData*)resource->ptr );
	return bxFinishResourceShape( slot, body, resourceSlot, id );
}

// ---------------------------------------------------------------------------
// Hull, compound and mesh builders
// ---------------------------------------------------------------------------

BX_EXPORT int bx_CreateHull( const float* points, int pointCount, int maxVertices )
{
	if ( points == NULL || pointCount < 4 )
	{
		return 0;
	}
	b3HullData* hull = b3CreateHull( (const b3Vec3*)points, pointCount, maxVertices );
	return hull == NULL ? 0 : bxNewResource( BX_RESOURCE_HULL, hull );
}

BX_EXPORT int bx_CreateCylinderHull( float height, float radius, float yOffset, int sides )
{
	b3HullData* hull = b3CreateCylinder( height, radius, yOffset, sides );
	return hull == NULL ? 0 : bxNewResource( BX_RESOURCE_HULL, hull );
}

BX_EXPORT int bx_CreateConeHull( float height, float radius1, float radius2, int slices )
{
	b3HullData* hull = b3CreateCone( height, radius1, radius2, slices );
	return hull == NULL ? 0 : bxNewResource( BX_RESOURCE_HULL, hull );
}

BX_EXPORT int bx_CreateRockHull( float radius )
{
	b3HullData* hull = b3CreateRock( radius );
	return hull == NULL ? 0 : bxNewResource( BX_RESOURCE_HULL, hull );
}

BX_EXPORT int bx_CreateComplexHull( float radius )
{
	b3HullData* hull = b3CreateComplexHull( radius );
	return hull == NULL ? 0 : bxNewResource( BX_RESOURCE_HULL, hull );
}

/// Copies the hull, transformed and scaled, into a new hull resource.
BX_EXPORT int bx_CloneHull( int resourceSlot, float px, float py, float pz, float qx, float qy, float qz, float qw, float sx,
							float sy, float sz )
{
	bxResource* resource = bxTable_Get( &bx_resources, resourceSlot );
	if ( resource == NULL || resource->alive == 0 || resource->kind != BX_RESOURCE_HULL )
	{
		return 0;
	}
	b3Transform xf = { bxVec3( px, py, pz ), bxUnitQuat( qx, qy, qz, qw ) };
	b3HullData* hull = b3CloneAndTransformHull( (const b3HullData*)resource->ptr, xf, bxVec3( sx, sy, sz ) );
	return hull == NULL ? 0 : bxNewResource( BX_RESOURCE_HULL, hull );
}

/// Hulls are cloned by the world, so a hull shape holds no reference to the resource.
BX_EXPORT int bx_CreateHullDataShape( int body, int resourceSlot, float px, float py, float pz, float qx, float qy, float qz,
									  float qw, float sx, float sy, float sz )
{
	int slot = 0;
	b3ShapeDef unused;
	if ( bxAttachResource( body, resourceSlot, BX_RESOURCE_HULL, &slot, &unused ) == 0 )
	{
		return 0;
	}
	b3ShapeDef def = bxReadShapeDefPublic( slot );
	bxResource* resource = bxTable_Get( &bx_resources, resourceSlot );
	b3Transform xf = { bxVec3( px, py, pz ), bxUnitQuat( qx, qy, qz, qw ) };
	b3ShapeId id =
		b3CreateTransformedHullShape( bxBodyId( body ), &def, (const b3HullData*)resource->ptr, xf, bxVec3( sx, sy, sz ) );
	if ( B3_IS_NULL( id ) )
	{
		bxTable_Free( &bx_shapes, slot );
		return 0;
	}
	bxShape* shape = bxTable_Get( &bx_shapes, slot );
	shape->id = id;
	shape->body = body;
	shape->alive = 1;
	return slot;
}

BX_EXPORT int bx_CreateBoxMesh( float cx, float cy, float cz, float ex, float ey, float ez, int identifyEdges )
{
	b3MeshData* mesh = b3CreateBoxMesh( bxVec3( cx, cy, cz ), bxVec3( ex, ey, ez ), identifyEdges != 0 );
	return mesh == NULL ? 0 : bxNewResource( BX_RESOURCE_MESH, mesh );
}

BX_EXPORT int bx_CreateHollowBoxMesh( float cx, float cy, float cz, float ex, float ey, float ez )
{
	b3MeshData* mesh = b3CreateHollowBoxMesh( bxVec3( cx, cy, cz ), bxVec3( ex, ey, ez ) );
	return mesh == NULL ? 0 : bxNewResource( BX_RESOURCE_MESH, mesh );
}

BX_EXPORT int bx_CreatePlatformMesh( float cx, float cy, float cz, float height, float topWidth, float bottomWidth )
{
	b3MeshData* mesh = b3CreatePlatformMesh( bxVec3( cx, cy, cz ), height, topWidth, bottomWidth );
	return mesh == NULL ? 0 : bxNewResource( BX_RESOURCE_MESH, mesh );
}

BX_EXPORT int bx_CreateGridMesh( int xCount, int zCount, float cellWidth, int materialCount, int identifyEdges )
{
	b3MeshData* mesh = b3CreateGridMesh( xCount, zCount, cellWidth, materialCount, identifyEdges != 0 );
	return mesh == NULL ? 0 : bxNewResource( BX_RESOURCE_MESH, mesh );
}

BX_EXPORT int bx_CreateWaveMesh( int xCount, int zCount, float cellWidth, float amplitude, float rowFrequency,
								 float columnFrequency )
{
	b3MeshData* mesh = b3CreateWaveMesh( xCount, zCount, cellWidth, amplitude, rowFrequency, columnFrequency );
	return mesh == NULL ? 0 : bxNewResource( BX_RESOURCE_MESH, mesh );
}

BX_EXPORT int bx_CreateTorusMesh( int radialResolution, int tubularResolution, float radius, float thickness )
{
	b3MeshData* mesh = b3CreateTorusMesh( radialResolution, tubularResolution, radius, thickness );
	return mesh == NULL ? 0 : bxNewResource( BX_RESOURCE_MESH, mesh );
}

/// Height of the mesh BVH, for diagnostics.
BX_EXPORT int bx_Mesh_GetHeight( int resourceSlot )
{
	bxResource* resource = bxTable_Get( &bx_resources, resourceSlot );
	if ( resource == NULL || resource->alive == 0 || resource->kind != BX_RESOURCE_MESH )
	{
		return 0;
	}
	return b3GetHeight( (const b3MeshData*)resource->ptr );
}

// ---------------------------------------------------------------------------
// Geometry extraction: triangles for rendering a hull or mesh.
// ---------------------------------------------------------------------------

static float* s_geoVertices;
static int s_geoVertexCapacity;
static int* s_geoIndices;
static int s_geoIndexCount;
static int s_geoIndexCapacity;

static float* bxGeoVertices( int count )
{
	if ( count * 3 > s_geoVertexCapacity )
	{
		s_geoVertexCapacity = count * 3 * 2;
		s_geoVertices = (float*)realloc( s_geoVertices, (size_t)s_geoVertexCapacity * sizeof( float ) );
	}
	return s_geoVertices;
}

static int* bxGeoIndices( int count )
{
	if ( count > s_geoIndexCapacity )
	{
		s_geoIndexCapacity = count * 2;
		s_geoIndices = (int*)realloc( s_geoIndices, (size_t)s_geoIndexCapacity * sizeof( int ) );
	}
	s_geoIndexCount = count;
	return s_geoIndices;
}

static int bxFillHull( const b3HullData* hull )
{
	int vertexCount = hull->vertexCount;
	const b3Vec3* points = b3GetHullPoints( hull );
	float* out = bxGeoVertices( vertexCount );
	for ( int i = 0; i < vertexCount; ++i )
	{
		out[3 * i] = points[i].x;
		out[3 * i + 1] = points[i].y;
		out[3 * i + 2] = points[i].z;
	}
	const b3HullHalfEdge* edges = b3GetHullEdges( hull );
	const b3HullFace* faces = b3GetHullFaces( hull );
	// count indices first: a face with n corners makes n - 2 triangles
	int indexCount = 0;
	for ( int f = 0; f < hull->faceCount; ++f )
	{
		int e0 = faces[f].edge;
		int n = 0;
		int e = e0;
		do
		{
			n += 1;
			e = edges[e].next;
		}
		while ( e != e0 && n < 256 );
		indexCount += 3 * ( n - 2 );
	}
	int* indices = bxGeoIndices( indexCount );
	int at = 0;
	for ( int f = 0; f < hull->faceCount; ++f )
	{
		int e0 = faces[f].edge;
		int first = edges[e0].origin;
		int prev = edges[edges[e0].next].origin;
		int e = edges[edges[e0].next].next;
		while ( e != e0 )
		{
			int current = edges[e].origin;
			indices[at++] = first;
			indices[at++] = prev;
			indices[at++] = current;
			prev = current;
			e = edges[e].next;
		}
	}
	return vertexCount;
}

static int bxFillMesh( const b3MeshData* mesh, b3Vec3 scale )
{
	int vertexCount = mesh->vertexCount;
	const b3Vec3* vertices = b3GetMeshVertices( mesh );
	float* out = bxGeoVertices( vertexCount );
	for ( int i = 0; i < vertexCount; ++i )
	{
		out[3 * i] = vertices[i].x * scale.x;
		out[3 * i + 1] = vertices[i].y * scale.y;
		out[3 * i + 2] = vertices[i].z * scale.z;
	}
	int triangleCount = mesh->triangleCount;
	const b3MeshTriangle* triangles = b3GetMeshTriangles( mesh );
	// a negative scale component flips winding; keep the triangles front facing
	int flip = ( scale.x < 0.0f ) ^ ( scale.y < 0.0f ) ^ ( scale.z < 0.0f );
	int* indices = bxGeoIndices( triangleCount * 3 );
	for ( int i = 0; i < triangleCount; ++i )
	{
		indices[3 * i] = triangles[i].index1;
		indices[3 * i + 1] = flip ? triangles[i].index3 : triangles[i].index2;
		indices[3 * i + 2] = flip ? triangles[i].index2 : triangles[i].index3;
	}
	return vertexCount;
}

BX_EXPORT float* bx_Geometry_Vertices( void )
{
	return s_geoVertices;
}

BX_EXPORT int* bx_Geometry_Indices( void )
{
	return s_geoIndices;
}

BX_EXPORT int bx_Geometry_IndexCount( void )
{
	return s_geoIndexCount;
}

/// Fills the geometry buffers from a hull or mesh resource. Returns the vertex count.
BX_EXPORT int bx_Resource_GetGeometry( int resourceSlot )
{
	s_geoIndexCount = 0;
	bxResource* resource = bxTable_Get( &bx_resources, resourceSlot );
	if ( resource == NULL || resource->alive == 0 )
	{
		return 0;
	}
	if ( resource->kind == BX_RESOURCE_HULL )
	{
		return bxFillHull( (const b3HullData*)resource->ptr );
	}
	if ( resource->kind == BX_RESOURCE_MESH )
	{
		return bxFillMesh( (const b3MeshData*)resource->ptr, bxVec3( 1.0f, 1.0f, 1.0f ) );
	}
	return 0;
}

/// Fills the geometry buffers from a hull or mesh shape (mesh scale applied). Returns the vertex count, 0 for other shapes.
BX_EXPORT int bx_Shape_GetGeometry( int slot )
{
	s_geoIndexCount = 0;
	b3ShapeId shapeId = bxShapeId( slot );
	if ( B3_IS_NULL( shapeId ) )
	{
		return 0;
	}
	b3ShapeType type = b3Shape_GetType( shapeId );
	if ( type == b3_hullShape )
	{
		return bxFillHull( b3Shape_GetHull( shapeId ) );
	}
	if ( type == b3_meshShape )
	{
		b3Mesh mesh = b3Shape_GetMesh( shapeId );
		return bxFillMesh( mesh.data, mesh.scale );
	}
	return 0;
}

// ---------------------------------------------------------------------------
// Compound
// ---------------------------------------------------------------------------

/// Builds a baked compound.
/// spheres: 4 floats each [cx, cy, cz, radius]
/// capsules: 7 floats each [ax, ay, az, bx, by, bz, radius]
/// hulls: 8 floats each [resource, px, py, pz, qx, qy, qz, qw]
/// meshes: 11 floats each [resource, px, py, pz, qx, qy, qz, qw, sx, sy, sz]
/// The resource slots travel as floats (exact below 2^24). Returns 0 on failure.
BX_EXPORT int bx_CreateCompound( const float* spheres, int sphereCount, const float* capsules, int capsuleCount,
								 const float* hulls, int hullCount, const float* meshes, int meshCount )
{
	b3SurfaceMaterial material = b3DefaultSurfaceMaterial();
	b3CompoundDef def = { 0 };
	b3CompoundSphereDef* sphereDefs = NULL;
	b3CompoundCapsuleDef* capsuleDefs = NULL;
	b3CompoundHullDef* hullDefs = NULL;
	b3CompoundMeshDef* meshDefs = NULL;
	int ok = 1;

	if ( sphereCount > 0 )
	{
		sphereDefs = (b3CompoundSphereDef*)calloc( (size_t)sphereCount, sizeof( b3CompoundSphereDef ) );
		for ( int i = 0; i < sphereCount; ++i )
		{
			const float* s = spheres + 4 * i;
			sphereDefs[i].sphere.center = bxVec3( s[0], s[1], s[2] );
			sphereDefs[i].sphere.radius = s[3];
			sphereDefs[i].material = material;
		}
	}
	if ( capsuleCount > 0 )
	{
		capsuleDefs = (b3CompoundCapsuleDef*)calloc( (size_t)capsuleCount, sizeof( b3CompoundCapsuleDef ) );
		for ( int i = 0; i < capsuleCount; ++i )
		{
			const float* c = capsules + 7 * i;
			capsuleDefs[i].capsule.center1 = bxVec3( c[0], c[1], c[2] );
			capsuleDefs[i].capsule.center2 = bxVec3( c[3], c[4], c[5] );
			capsuleDefs[i].capsule.radius = c[6];
			capsuleDefs[i].material = material;
		}
	}
	if ( hullCount > 0 )
	{
		hullDefs = (b3CompoundHullDef*)calloc( (size_t)hullCount, sizeof( b3CompoundHullDef ) );
		for ( int i = 0; i < hullCount && ok; ++i )
		{
			const float* h = hulls + 8 * i;
			bxResource* resource = bxTable_Get( &bx_resources, (int)h[0] );
			if ( resource == NULL || resource->alive == 0 || resource->kind != BX_RESOURCE_HULL )
			{
				ok = 0;
				break;
			}
			hullDefs[i].hull = (const b3HullData*)resource->ptr;
			hullDefs[i].transform.p = bxVec3( h[1], h[2], h[3] );
			hullDefs[i].transform.q = bxUnitQuat( h[4], h[5], h[6], h[7] );
			hullDefs[i].material = material;
		}
	}
	if ( meshCount > 0 )
	{
		meshDefs = (b3CompoundMeshDef*)calloc( (size_t)meshCount, sizeof( b3CompoundMeshDef ) );
		for ( int i = 0; i < meshCount && ok; ++i )
		{
			const float* m = meshes + 11 * i;
			bxResource* resource = bxTable_Get( &bx_resources, (int)m[0] );
			if ( resource == NULL || resource->alive == 0 || resource->kind != BX_RESOURCE_MESH )
			{
				ok = 0;
				break;
			}
			meshDefs[i].meshData = (const b3MeshData*)resource->ptr;
			meshDefs[i].transform.p = bxVec3( m[1], m[2], m[3] );
			meshDefs[i].transform.q = bxUnitQuat( m[4], m[5], m[6], m[7] );
			meshDefs[i].scale = bxVec3( m[8], m[9], m[10] );
			meshDefs[i].materials = &material;
			meshDefs[i].materialCount = 1;
		}
	}

	int slot = 0;
	if ( ok )
	{
		def.spheres = sphereDefs;
		def.sphereCount = sphereCount;
		def.capsules = capsuleDefs;
		def.capsuleCount = capsuleCount;
		def.hulls = hullDefs;
		def.hullCount = hullCount;
		def.meshes = meshDefs;
		def.meshCount = meshCount;
		b3CompoundData* compound = b3CreateCompound( &def );
		if ( compound != NULL )
		{
			slot = bxNewResource( BX_RESOURCE_COMPOUND, compound );
		}
	}
	free( sphereDefs );
	free( capsuleDefs );
	free( hullDefs );
	free( meshDefs );
	return slot;
}

/// Compounds are only allowed on static bodies. The shape references the compound until it is destroyed.
BX_EXPORT int bx_CreateCompoundShape( int body, int resourceSlot )
{
	int slot = 0;
	b3ShapeDef def;
	if ( bxAttachResource( body, resourceSlot, BX_RESOURCE_COMPOUND, &slot, &def ) == 0 )
	{
		return 0;
	}
	def = bxReadShapeDefPublic( slot );
	bxResource* resource = bxTable_Get( &bx_resources, resourceSlot );
	b3ShapeId id = b3CreateBakedCompoundShape( bxBodyId( body ), &def, (const b3CompoundData*)resource->ptr );
	return bxFinishResourceShape( slot, body, resourceSlot, id );
}

// ---------------------------------------------------------------------------
// Procedural height fields and mesh swapping
// ---------------------------------------------------------------------------

BX_EXPORT int bx_CreateGridHeightField( int rowCount, int columnCount, float sx, float sy, float sz, int makeHoles )
{
	b3HeightFieldData* data = b3CreateGrid( rowCount, columnCount, bxVec3( sx, sy, sz ), makeHoles != 0 );
	return data == NULL ? 0 : bxNewResource( BX_RESOURCE_HEIGHT_FIELD, data );
}

BX_EXPORT int bx_CreateWaveHeightField( int rowCount, int columnCount, float sx, float sy, float sz, float rowFrequency,
										float columnFrequency, int makeHoles )
{
	b3HeightFieldData* data =
		b3CreateWave( rowCount, columnCount, bxVec3( sx, sy, sz ), rowFrequency, columnFrequency, makeHoles != 0 );
	return data == NULL ? 0 : bxNewResource( BX_RESOURCE_HEIGHT_FIELD, data );
}

/// Points a mesh shape at another mesh (or the same mesh at another scale). Does not change the body's mass.
BX_EXPORT void bx_Shape_SetMesh( int slot, int resourceSlot, float sx, float sy, float sz )
{
	bxShape* shape = bxTable_Get( &bx_shapes, slot );
	bxResource* next = bxTable_Get( &bx_resources, resourceSlot );
	if ( shape == NULL || shape->alive == 0 || next == NULL || next->alive == 0 || next->released ||
		 next->kind != BX_RESOURCE_MESH || b3Shape_GetType( shape->id ) != b3_meshShape )
	{
		return;
	}
	int previousSlot = shape->resource;
	b3Shape_SetMesh( shape->id, (const b3MeshData*)next->ptr, bxVec3( sx, sy, sz ) );
	if ( previousSlot != resourceSlot )
	{
		next->refs += 1;
		shape->resource = resourceSlot;
		bxResource* previous = bxTable_Get( &bx_resources, previousSlot );
		if ( previous != NULL && previous->alive )
		{
			previous->refs -= 1;
			if ( previous->released && previous->refs <= 0 )
			{
				b3DestroyMesh( (b3MeshData*)previous->ptr );
				bxTable_Free( &bx_resources, previousSlot );
			}
		}
	}
}
