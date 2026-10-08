// Standalone geometry and collision: mass, bounds, ray and shape casts,
// overlap, manifolds, GJK distance and time of impact on primitives that are
// described from JS, without a world.
//
// A primitive is a float descriptor in wasm memory, kind first:
//   1 sphere    [cx, cy, cz, radius]
//   2 capsule   [ax, ay, az, bx, by, bz, radius]
//   3 hull      [resource]
//   4 mesh      [resource, sx, sy, sz]
//   5 height    [resource]
//   6 compound  [resource]
//   7 triangle  [x1, y1, z1, x2, y2, z2, x3, y3, z3]
// Resource slots travel as floats (exact below 2^24).
#include "bx.h"

#include <stdlib.h>
#include <string.h>

enum bxPrimKind
{
	BX_PRIM_SPHERE = 1,
	BX_PRIM_CAPSULE = 2,
	BX_PRIM_HULL = 3,
	BX_PRIM_MESH = 4,
	BX_PRIM_HEIGHT = 5,
	BX_PRIM_COMPOUND = 6,
	BX_PRIM_TRIANGLE = 7,
};

typedef struct bxPrim
{
	int kind;
	b3Sphere sphere;
	b3Capsule capsule;
	const b3HullData* hull;
	b3Mesh mesh;
	const b3HeightFieldData* heightField;
	const b3CompoundData* compound;
	b3Vec3 triangle[3];
} bxPrim;

static b3Vec3 bxV( float x, float y, float z )
{
	b3Vec3 v = { x, y, z };
	return v;
}

static b3Transform bxXf( const float* f )
{
	b3Transform xf = { { f[0], f[1], f[2] }, bxUnitQuat( f[3], f[4], f[5], f[6] ) };
	return xf;
}

static const void* bxResourcePtr( float slot, int kind )
{
	bxResource* resource = bxTable_Get( &bx_resources, (int)slot );
	if ( resource == NULL || resource->alive == 0 || resource->kind != kind )
	{
		return NULL;
	}
	return resource->ptr;
}

/// Returns 0 when the descriptor is malformed or references a dead resource.
static int bxReadPrim( const float* d, bxPrim* prim )
{
	memset( prim, 0, sizeof( *prim ) );
	prim->kind = (int)d[0];
	switch ( prim->kind )
	{
		case BX_PRIM_SPHERE:
			prim->sphere.center = bxV( d[1], d[2], d[3] );
			prim->sphere.radius = d[4];
			return 1;
		case BX_PRIM_CAPSULE:
			prim->capsule.center1 = bxV( d[1], d[2], d[3] );
			prim->capsule.center2 = bxV( d[4], d[5], d[6] );
			prim->capsule.radius = d[7];
			return 1;
		case BX_PRIM_HULL:
			prim->hull = (const b3HullData*)bxResourcePtr( d[1], BX_RESOURCE_HULL );
			return prim->hull != NULL;
		case BX_PRIM_MESH:
			prim->mesh.data = (const b3MeshData*)bxResourcePtr( d[1], BX_RESOURCE_MESH );
			prim->mesh.scale = bxV( d[2], d[3], d[4] );
			return prim->mesh.data != NULL;
		case BX_PRIM_HEIGHT:
			prim->heightField = (const b3HeightFieldData*)bxResourcePtr( d[1], BX_RESOURCE_HEIGHT_FIELD );
			return prim->heightField != NULL;
		case BX_PRIM_COMPOUND:
			prim->compound = (const b3CompoundData*)bxResourcePtr( d[1], BX_RESOURCE_COMPOUND );
			return prim->compound != NULL;
		case BX_PRIM_TRIANGLE:
			prim->triangle[0] = bxV( d[1], d[2], d[3] );
			prim->triangle[1] = bxV( d[4], d[5], d[6] );
			prim->triangle[2] = bxV( d[7], d[8], d[9] );
			return 1;
		default:
			return 0;
	}
}

// ---------------------------------------------------------------------------
// Mass and bounds
// ---------------------------------------------------------------------------

/// Sphere, capsule and hull only. Returns 1 on success. scratch: [mass, cx, cy, cz, inertia x9]
BX_EXPORT int bx_Prim_ComputeMass( const float* desc, float density )
{
	bxPrim prim;
	if ( bxReadPrim( desc, &prim ) == 0 )
	{
		return 0;
	}
	b3MassData md;
	switch ( prim.kind )
	{
		case BX_PRIM_SPHERE:
			md = b3ComputeSphereMass( &prim.sphere, density );
			break;
		case BX_PRIM_CAPSULE:
			md = b3ComputeCapsuleMass( &prim.capsule, density );
			break;
		case BX_PRIM_HULL:
			md = b3ComputeHullMass( prim.hull, density );
			break;
		default:
			return 0;
	}
	bx_scratch[0].f = md.mass;
	bxScratchVec3( 1, md.center );
	bxScratchMat3( 4, md.inertia );
	return 1;
}

/// xf: [px, py, pz, qx, qy, qz, qw]. scratch: [lx, ly, lz, ux, uy, uz]
BX_EXPORT int bx_Prim_ComputeAABB( const float* desc, const float* xfData )
{
	bxPrim prim;
	if ( bxReadPrim( desc, &prim ) == 0 )
	{
		return 0;
	}
	b3Transform xf = bxXf( xfData );
	b3AABB aabb;
	switch ( prim.kind )
	{
		case BX_PRIM_SPHERE:
			aabb = b3ComputeSphereAABB( &prim.sphere, xf );
			break;
		case BX_PRIM_CAPSULE:
			aabb = b3ComputeCapsuleAABB( &prim.capsule, xf );
			break;
		case BX_PRIM_HULL:
			aabb = b3ComputeHullAABB( prim.hull, xf );
			break;
		case BX_PRIM_MESH:
			aabb = b3ComputeMeshAABB( prim.mesh.data, xf, prim.mesh.scale );
			break;
		case BX_PRIM_HEIGHT:
			aabb = b3ComputeHeightFieldAABB( prim.heightField, xf );
			break;
		case BX_PRIM_COMPOUND:
			aabb = b3ComputeCompoundAABB( prim.compound, xf );
			break;
		default:
			return 0;
	}
	bxScratchVec3( 0, aabb.lowerBound );
	bxScratchVec3( 3, aabb.upperBound );
	return 1;
}

// ---------------------------------------------------------------------------
// Casts and overlap
// ---------------------------------------------------------------------------

// scratch: [hit (i32), nx, ny, nz, px, py, pz, fraction, iterations (i32), triangle (i32), child (i32), material (i32)]
static int bxWriteCast( b3CastOutput out )
{
	bx_scratch[0].i = out.hit ? 1 : 0;
	bxScratchVec3( 1, out.normal );
	bxScratchVec3( 4, out.point );
	bx_scratch[7].f = out.fraction;
	bx_scratch[8].i = out.iterations;
	bx_scratch[9].i = out.triangleIndex;
	bx_scratch[10].i = out.childIndex;
	bx_scratch[11].i = out.materialIndex;
	return out.hit ? 1 : 0;
}

/// ray: [ox, oy, oz, tx, ty, tz, maxFraction, hollow (spheres only, 0 or 1)] in the primitive's local space.
/// Returns 1 on a hit; scratch as bxWriteCast.
BX_EXPORT int bx_Prim_RayCast( const float* desc, const float* ray )
{
	bxPrim prim;
	if ( bxReadPrim( desc, &prim ) == 0 )
	{
		return 0;
	}
	b3RayCastInput input = { bxV( ray[0], ray[1], ray[2] ), bxV( ray[3], ray[4], ray[5] ), ray[6] };
	if ( b3IsValidRay( &input ) == false )
	{
		return 0;
	}
	switch ( prim.kind )
	{
		case BX_PRIM_SPHERE:
			return bxWriteCast( ray[7] != 0.0f ? b3RayCastHollowSphere( &prim.sphere, &input )
											   : b3RayCastSphere( &prim.sphere, &input ) );
		case BX_PRIM_CAPSULE:
			return bxWriteCast( b3RayCastCapsule( &prim.capsule, &input ) );
		case BX_PRIM_HULL:
			return bxWriteCast( b3RayCastHull( prim.hull, &input ) );
		case BX_PRIM_MESH:
			return bxWriteCast( b3RayCastMesh( &prim.mesh, &input ) );
		case BX_PRIM_HEIGHT:
			return bxWriteCast( b3RayCastHeightField( prim.heightField, &input ) );
		case BX_PRIM_COMPOUND:
			return bxWriteCast( b3RayCastCompound( prim.compound, &input ) );
		default:
			return 0;
	}
}

BX_EXPORT int bx_IsValidRay( const float* ray )
{
	b3RayCastInput input = { bxV( ray[0], ray[1], ray[2] ), bxV( ray[3], ray[4], ray[5] ), ray[6] };
	return b3IsValidRay( &input );
}

/// input: [tx, ty, tz, maxFraction, canEncroach, radius, points...] with pointCount points, in the primitive's local space.
BX_EXPORT int bx_Prim_ShapeCast( const float* desc, const float* data, int pointCount )
{
	bxPrim prim;
	if ( bxReadPrim( desc, &prim ) == 0 || pointCount < 1 || pointCount > B3_MAX_SHAPE_CAST_POINTS )
	{
		return 0;
	}
	b3ShapeCastInput input;
	input.proxy.points = (const b3Vec3*)( data + 6 );
	input.proxy.count = pointCount;
	input.proxy.radius = data[5];
	input.translation = bxV( data[0], data[1], data[2] );
	input.maxFraction = data[3];
	input.canEncroach = data[4] != 0.0f;
	switch ( prim.kind )
	{
		case BX_PRIM_SPHERE:
			return bxWriteCast( b3ShapeCastSphere( &prim.sphere, &input ) );
		case BX_PRIM_CAPSULE:
			return bxWriteCast( b3ShapeCastCapsule( &prim.capsule, &input ) );
		case BX_PRIM_HULL:
			return bxWriteCast( b3ShapeCastHull( prim.hull, &input ) );
		case BX_PRIM_MESH:
			return bxWriteCast( b3ShapeCastMesh( &prim.mesh, &input ) );
		case BX_PRIM_HEIGHT:
			return bxWriteCast( b3ShapeCastHeightField( prim.heightField, &input ) );
		case BX_PRIM_COMPOUND:
			return bxWriteCast( b3ShapeCastCompound( prim.compound, &input ) );
		default:
			return 0;
	}
}

/// data: [radius, points...]. xf places the primitive. Returns 1 when the proxy overlaps it.
BX_EXPORT int bx_Prim_Overlap( const float* desc, const float* xfData, const float* data, int pointCount )
{
	bxPrim prim;
	if ( bxReadPrim( desc, &prim ) == 0 || pointCount < 1 || pointCount > B3_MAX_SHAPE_CAST_POINTS )
	{
		return 0;
	}
	b3ShapeProxy proxy = { (const b3Vec3*)( data + 1 ), pointCount, data[0] };
	b3Transform xf = bxXf( xfData );
	switch ( prim.kind )
	{
		case BX_PRIM_SPHERE:
			return b3OverlapSphere( &prim.sphere, xf, &proxy );
		case BX_PRIM_CAPSULE:
			return b3OverlapCapsule( &prim.capsule, xf, &proxy );
		case BX_PRIM_HULL:
			return b3OverlapHull( prim.hull, xf, &proxy );
		case BX_PRIM_MESH:
			return b3OverlapMesh( &prim.mesh, xf, &proxy );
		case BX_PRIM_HEIGHT:
			return b3OverlapHeightField( prim.heightField, xf, &proxy );
		case BX_PRIM_COMPOUND:
			return b3OverlapCompound( prim.compound, xf, &proxy );
		default:
			return 0;
	}
}

// ---------------------------------------------------------------------------
// Triangles of a mesh or height field inside a box, for debug draw
// ---------------------------------------------------------------------------

static float* s_tris;
static int s_triCount;
static int s_triCapacity;

static bool bxTriCallback( b3Vec3 a, b3Vec3 b, b3Vec3 c, int triangleIndex, void* context )
{
	(void)context;
	if ( s_triCount >= s_triCapacity )
	{
		s_triCapacity = s_triCapacity == 0 ? 256 : s_triCapacity * 2;
		s_tris = (float*)realloc( s_tris, (size_t)s_triCapacity * 10 * sizeof( float ) );
	}
	float* t = s_tris + (size_t)s_triCount * 10;
	t[0] = a.x;
	t[1] = a.y;
	t[2] = a.z;
	t[3] = b.x;
	t[4] = b.y;
	t[5] = b.z;
	t[6] = c.x;
	t[7] = c.y;
	t[8] = c.z;
	( (int*)t )[9] = triangleIndex;
	s_triCount += 1;
	return true;
}

/// 10 words per triangle: three vertices (9 floats) and the triangle index (i32).
BX_EXPORT float* bx_Tris_Buffer( void )
{
	return s_tris;
}

/// bounds: [lx, ly, lz, ux, uy, uz] in the primitive's local space. Returns the triangle count.
BX_EXPORT int bx_Prim_QueryTriangles( const float* desc, const float* bounds )
{
	s_triCount = 0;
	bxPrim prim;
	if ( bxReadPrim( desc, &prim ) == 0 )
	{
		return 0;
	}
	b3AABB aabb = { bxV( bounds[0], bounds[1], bounds[2] ), bxV( bounds[3], bounds[4], bounds[5] ) };
	if ( prim.kind == BX_PRIM_MESH )
	{
		b3QueryMesh( &prim.mesh, aabb, bxTriCallback, NULL );
	}
	else if ( prim.kind == BX_PRIM_HEIGHT )
	{
		b3QueryHeightField( prim.heightField, aabb, bxTriCallback, NULL );
	}
	return s_triCount;
}

// ---------------------------------------------------------------------------
// Distance, pair shape cast, time of impact
// ---------------------------------------------------------------------------

/// Persistent GJK and SAT caches, so repeated queries on the same pair warm start. Pass 0 for a throwaway cache.
typedef struct bxCache
{
	b3SimplexCache simplex;
	b3SATCache sat;
} bxCache;

BX_EXPORT bxCache* bx_Cache_Create( void )
{
	return (bxCache*)calloc( 1, sizeof( bxCache ) );
}

BX_EXPORT void bx_Cache_Destroy( bxCache* cache )
{
	free( cache );
}

BX_EXPORT void bx_Cache_Reset( bxCache* cache )
{
	if ( cache != NULL )
	{
		memset( cache, 0, sizeof( *cache ) );
	}
}

/// data: [xf (7: B in A's frame), useRadii, radiusA, radiusB, pointsA..., pointsB...]
/// scratch: [pax, pay, paz, pbx, pby, pbz, nx, ny, nz, distance, iterations (i32), simplexCount (i32)]
BX_EXPORT void bx_ShapeDistance( const float* data, int countA, int countB, bxCache* cache )
{
	bxCache local = { 0 };
	b3DistanceInput input;
	const float* pointsA = data + 10;
	input.proxyA = ( b3ShapeProxy ){ (const b3Vec3*)pointsA, countA, data[8] };
	input.proxyB = ( b3ShapeProxy ){ (const b3Vec3*)( pointsA + 3 * countA ), countB, data[9] };
	input.transform = bxXf( data );
	input.useRadii = data[7] != 0.0f;
	b3DistanceOutput out = b3ShapeDistance( &input, cache != NULL ? &cache->simplex : &local.simplex, NULL, 0 );
	bxScratchVec3( 0, out.pointA );
	bxScratchVec3( 3, out.pointB );
	bxScratchVec3( 6, out.normal );
	bx_scratch[9].f = out.distance;
	bx_scratch[10].i = out.iterations;
	bx_scratch[11].i = out.simplexCount;
}

/// data: [xf (7: B in A's frame), tx, ty, tz (B translation in A's frame), maxFraction, canEncroach, radiusA, radiusB,
/// pointsA..., pointsB...]. Returns 1 on a hit; scratch as bxWriteCast.
BX_EXPORT int bx_ShapeCastPair( const float* data, int countA, int countB )
{
	b3ShapeCastPairInput input;
	const float* pointsA = data + 14;
	input.proxyA = ( b3ShapeProxy ){ (const b3Vec3*)pointsA, countA, data[12] };
	input.proxyB = ( b3ShapeProxy ){ (const b3Vec3*)( pointsA + 3 * countA ), countB, data[13] };
	input.transform = bxXf( data );
	input.translationB = bxV( data[7], data[8], data[9] );
	input.maxFraction = data[10];
	input.canEncroach = data[11] != 0.0f;
	return bxWriteCast( b3ShapeCast( &input ) );
}

static b3Sweep bxSweep( const float* s )
{
	b3Sweep sweep;
	sweep.localCenter = bxV( s[0], s[1], s[2] );
	sweep.c1 = bxV( s[3], s[4], s[5] );
	sweep.c2 = bxV( s[6], s[7], s[8] );
	sweep.q1 = bxUnitQuat( s[9], s[10], s[11], s[12] );
	sweep.q2 = bxUnitQuat( s[13], s[14], s[15], s[16] );
	return sweep;
}

/// sweep: [localCenter(3), c1(3), c2(3), q1(4), q2(4)]. scratch: [px, py, pz, qx, qy, qz, qw]
BX_EXPORT void bx_GetSweepTransform( const float* sweepData, float time )
{
	b3Sweep sweep = bxSweep( sweepData );
	b3Transform xf = b3GetSweepTransform( &sweep, time );
	bxScratchTransform( 0, xf );
}

/// data: [sweepA (17), sweepB (17), maxFraction, radiusA, radiusB, pointsA..., pointsB...]
/// scratch: [state (i32), px, py, pz, nx, ny, nz, fraction, distance, distanceIterations (i32), pushBackIterations (i32),
/// rootIterations (i32), usedFallback (i32)]
/// state: 0 unknown, 1 failed, 2 overlapped, 3 hit, 4 separated
BX_EXPORT void bx_TimeOfImpact( const float* data, int countA, int countB )
{
	b3TOIInput input;
	const float* pointsA = data + 37;
	input.proxyA = ( b3ShapeProxy ){ (const b3Vec3*)pointsA, countA, data[35] };
	input.proxyB = ( b3ShapeProxy ){ (const b3Vec3*)( pointsA + 3 * countA ), countB, data[36] };
	input.sweepA = bxSweep( data );
	input.sweepB = bxSweep( data + 17 );
	input.maxFraction = data[34];
	b3TOIOutput out = b3TimeOfImpact( &input );
	bx_scratch[0].i = (int)out.state;
	bxScratchVec3( 1, out.point );
	bxScratchVec3( 4, out.normal );
	bx_scratch[7].f = out.fraction;
	bx_scratch[8].f = out.distance;
	bx_scratch[9].i = out.distanceIterations;
	bx_scratch[10].i = out.pushBackIterations;
	bx_scratch[11].i = out.rootIterations;
	bx_scratch[12].i = out.usedFallback ? 1 : 0;
}

// ---------------------------------------------------------------------------
// Manifolds
// ---------------------------------------------------------------------------

#define BX_MANIFOLD_CAPACITY 16
#define BX_MANIFOLD_HEADER 14
#define BX_MANIFOLD_POINT_WORDS 6
#define BX_MANIFOLD_WORDS ( BX_MANIFOLD_HEADER + BX_MANIFOLD_CAPACITY * BX_MANIFOLD_POINT_WORDS )

static bxWord s_manifold[BX_MANIFOLD_WORDS];

/// Header 14 words: [pointCount (i32), nx, ny, nz (local, frame A), tnx, tny, tnz (triangle normal), triangleIndex (i32),
/// i1, i2, i3 (i32), squaredDistance, feature (i32), flags (i32)]; then up to 16 points of 6 words:
/// [x, y, z, separation, featurePair (u32: owner1 | index1 << 8 | owner2 << 16 | index2 << 24), triangleIndex (i32)].
BX_EXPORT bxWord* bx_Manifold_Buffer( void )
{
	return s_manifold;
}

BX_EXPORT int bx_Manifold_Words( void )
{
	return BX_MANIFOLD_WORDS;
}

static int bxWriteManifold( const b3LocalManifold* m )
{
	memset( s_manifold, 0, sizeof( s_manifold ) );
	int count = m->pointCount < BX_MANIFOLD_CAPACITY ? m->pointCount : BX_MANIFOLD_CAPACITY;
	s_manifold[0].i = count;
	s_manifold[1].f = m->normal.x;
	s_manifold[2].f = m->normal.y;
	s_manifold[3].f = m->normal.z;
	s_manifold[4].f = m->triangleNormal.x;
	s_manifold[5].f = m->triangleNormal.y;
	s_manifold[6].f = m->triangleNormal.z;
	s_manifold[7].i = m->triangleIndex;
	s_manifold[8].i = m->i1;
	s_manifold[9].i = m->i2;
	s_manifold[10].i = m->i3;
	s_manifold[11].f = m->squaredDistance;
	s_manifold[12].i = (int)m->feature;
	s_manifold[13].i = m->triangleFlags;
	for ( int i = 0; i < count; ++i )
	{
		const b3LocalManifoldPoint* p = m->points + i;
		bxWord* w = s_manifold + BX_MANIFOLD_HEADER + i * BX_MANIFOLD_POINT_WORDS;
		w[0].f = p->point.x;
		w[1].f = p->point.y;
		w[2].f = p->point.z;
		w[3].f = p->separation;
		w[4].u = (uint32_t)p->pair.owner1 | ( (uint32_t)p->pair.index1 << 8 ) | ( (uint32_t)p->pair.owner2 << 16 ) |
				 ( (uint32_t)p->pair.index2 << 24 );
		w[5].i = p->triangleIndex;
	}
	return count;
}

/// Collides primitive A with primitive B (B placed in A's frame by xfBtoA). Returns the point count, or -1 for an unsupported
/// pair. Supported: sphere/sphere, capsule/sphere, hull/sphere, capsule/capsule, hull/capsule, hull/hull, and a triangle (A)
/// with a sphere, capsule or hull (B; the triangle is in A's frame and xfBtoA is ignored for triangle pairs, as upstream).
BX_EXPORT int bx_Collide( const float* descA, const float* descB, const float* xfBtoA, bxCache* cache, int speculative )
{
	bxPrim a;
	bxPrim b;
	if ( bxReadPrim( descA, &a ) == 0 || bxReadPrim( descB, &b ) == 0 )
	{
		return -1;
	}
	bxCache local = { 0 };
	bxCache* c = cache != NULL ? cache : &local;
	b3Transform xf = bxXf( xfBtoA );
	b3LocalManifoldPoint points[BX_MANIFOLD_CAPACITY];
	b3LocalManifold manifold = { 0 };
	manifold.points = points;

	if ( a.kind == BX_PRIM_SPHERE && b.kind == BX_PRIM_SPHERE )
	{
		b3CollideSpheres( &manifold, BX_MANIFOLD_CAPACITY, &a.sphere, &b.sphere, xf );
	}
	else if ( a.kind == BX_PRIM_CAPSULE && b.kind == BX_PRIM_SPHERE )
	{
		b3CollideCapsuleAndSphere( &manifold, BX_MANIFOLD_CAPACITY, &a.capsule, &b.sphere, xf );
	}
	else if ( a.kind == BX_PRIM_HULL && b.kind == BX_PRIM_SPHERE )
	{
		b3CollideHullAndSphere( &manifold, BX_MANIFOLD_CAPACITY, a.hull, &b.sphere, xf, &c->simplex );
	}
	else if ( a.kind == BX_PRIM_CAPSULE && b.kind == BX_PRIM_CAPSULE )
	{
		b3CollideCapsules( &manifold, BX_MANIFOLD_CAPACITY, &a.capsule, &b.capsule, xf );
	}
	else if ( a.kind == BX_PRIM_HULL && b.kind == BX_PRIM_CAPSULE )
	{
		b3CollideHullAndCapsule( &manifold, BX_MANIFOLD_CAPACITY, a.hull, &b.capsule, xf, &c->simplex );
	}
	else if ( a.kind == BX_PRIM_HULL && b.kind == BX_PRIM_HULL )
	{
		b3CollideHulls( &manifold, BX_MANIFOLD_CAPACITY, a.hull, b.hull, xf, &c->sat );
	}
	else if ( a.kind == BX_PRIM_TRIANGLE && b.kind == BX_PRIM_CAPSULE )
	{
		b3CollideTriangleAndCapsule( &manifold, BX_MANIFOLD_CAPACITY, a.triangle, &b.capsule, &c->simplex );
	}
	else if ( a.kind == BX_PRIM_TRIANGLE && b.kind == BX_PRIM_HULL )
	{
		b3CollideTriangleAndHull( &manifold, BX_MANIFOLD_CAPACITY, a.triangle[0], a.triangle[1], a.triangle[2], 0, b.hull,
								  &c->sat, speculative != 0 );
	}
	else if ( a.kind == BX_PRIM_TRIANGLE && b.kind == BX_PRIM_SPHERE )
	{
		b3CollideTriangleAndSphere( &manifold, BX_MANIFOLD_CAPACITY, a.triangle, &b.sphere );
	}
	else
	{
		return -1;
	}
	return bxWriteManifold( &manifold );
}

// ---------------------------------------------------------------------------
// Box hull helpers
// ---------------------------------------------------------------------------

/// A box hull as a reusable hull resource. data: [hx, hy, hz, px, py, pz, qx, qy, qz, qw, sx, sy, sz] where p,q place the
/// box and s is a post scale. Uses the cube and offset-box fast paths when they apply.
BX_EXPORT int bx_CreateBoxHull( const float* d )
{
	b3Vec3 half = bxV( d[0], d[1], d[2] );
	b3Transform xf = bxXf( d + 3 );
	b3Vec3 scale = bxV( d[10], d[11], d[12] );
	int identityRotation = d[6] == 0.0f && d[7] == 0.0f && d[8] == 0.0f && d[9] == 1.0f;
	int unitScale = d[10] == 1.0f && d[11] == 1.0f && d[12] == 1.0f;
	int offset = d[3] != 0.0f || d[4] != 0.0f || d[5] != 0.0f;
	b3BoxHull box;
	if ( identityRotation && unitScale && offset == 0 && d[0] == d[1] && d[1] == d[2] )
	{
		box = b3MakeCubeHull( d[0] );
	}
	else if ( identityRotation && unitScale )
	{
		box = b3MakeOffsetBoxHull( d[0], d[1], d[2], xf.p );
	}
	else
	{
		box = b3MakeScaledBoxHull( half, xf, scale );
	}
	b3HullData* hull = b3CloneHull( &box.base );
	if ( hull == NULL )
	{
		return 0;
	}
	int slot = bxTable_Alloc( &bx_resources );
	bxResource* resource = bxTable_Get( &bx_resources, slot );
	resource->ptr = hull;
	resource->kind = BX_RESOURCE_HULL;
	resource->alive = 1;
	return slot;
}

/// Applies a post scale to a box described by half widths and a transform, keeping every half width at least minHalfWidth.
/// data: [hx, hy, hz, px, py, pz, qx, qy, qz, qw, sx, sy, sz, minHalfWidth].
/// scratch: [hx, hy, hz, px, py, pz, qx, qy, qz, qw]
BX_EXPORT void bx_ScaleBox( const float* d )
{
	b3Vec3 half = bxV( d[0], d[1], d[2] );
	b3Transform xf = bxXf( d + 3 );
	b3ScaleBox( &half, &xf, bxV( d[10], d[11], d[12] ), d[13] );
	bxScratchVec3( 0, half );
	bxScratchTransform( 3, xf );
}

/// Copies a hull resource.
BX_EXPORT int bx_Hull_Clone( int resourceSlot )
{
	const b3HullData* source = (const b3HullData*)bxResourcePtr( (float)resourceSlot, BX_RESOURCE_HULL );
	if ( source == NULL )
	{
		return 0;
	}
	b3HullData* hull = b3CloneHull( source );
	if ( hull == NULL )
	{
		return 0;
	}
	int slot = bxTable_Alloc( &bx_resources );
	bxResource* resource = bxTable_Get( &bx_resources, slot );
	resource->ptr = hull;
	resource->kind = BX_RESOURCE_HULL;
	resource->alive = 1;
	return slot;
}
