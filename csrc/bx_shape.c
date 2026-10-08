// Shapes: creation on a body from the def buffer plus scalar geometry, materials, filters, events.
#include "bx.h"

#define BX_SHAPE( slot )                                                                                                         \
	b3ShapeId shapeId = bxShapeId( slot );                                                                                       \
	if ( B3_IS_NULL( shapeId ) )                                                                                                 \
	{                                                                                                                            \
		return;                                                                                                                  \
	}

#define BX_SHAPE_RET( slot, value )                                                                                              \
	b3ShapeId shapeId = bxShapeId( slot );                                                                                       \
	if ( B3_IS_NULL( shapeId ) )                                                                                                 \
	{                                                                                                                            \
		return value;                                                                                                            \
	}

static b3Vec3 bxVec3( float x, float y, float z )
{
	b3Vec3 v = { x, y, z };
	return v;
}

/// Writes b3DefaultShapeDef into the def buffer.
BX_EXPORT void bx_ShapeDef_Default( void )
{
	b3ShapeDef def = b3DefaultShapeDef();
	bx_def[BX_SD_DENSITY].f = def.density;
	bx_def[BX_SD_FRICTION].f = def.baseMaterial.friction;
	bx_def[BX_SD_RESTITUTION].f = def.baseMaterial.restitution;
	bx_def[BX_SD_ROLLING_RESISTANCE].f = def.baseMaterial.rollingResistance;
	bxDefSetVec3( BX_SD_TANGENT_VELOCITY, def.baseMaterial.tangentVelocity );
	bx_def[BX_SD_EXPLOSION_SCALE].f = def.explosionScale;
	bxDefSetU64( BX_SD_USER_MATERIAL_ID, def.baseMaterial.userMaterialId );
	bxDefSetU64( BX_SD_CATEGORY_BITS, def.filter.categoryBits );
	bxDefSetU64( BX_SD_MASK_BITS, def.filter.maskBits );
	bx_def[BX_SD_GROUP_INDEX].i = def.filter.groupIndex;
	bx_def[BX_SD_FLAGS].u = 0;
	bxDefSetFlag( BX_SD_FLAGS, BX_SD_IS_SENSOR, def.isSensor );
	bxDefSetFlag( BX_SD_FLAGS, BX_SD_ENABLE_SENSOR_EVENTS, def.enableSensorEvents );
	bxDefSetFlag( BX_SD_FLAGS, BX_SD_ENABLE_CONTACT_EVENTS, def.enableContactEvents );
	bxDefSetFlag( BX_SD_FLAGS, BX_SD_ENABLE_HIT_EVENTS, def.enableHitEvents );
	bxDefSetFlag( BX_SD_FLAGS, BX_SD_ENABLE_PRE_SOLVE_EVENTS, def.enablePreSolveEvents );
	bxDefSetFlag( BX_SD_FLAGS, BX_SD_INVOKE_CONTACT_CREATION, def.invokeContactCreation );
	bxDefSetFlag( BX_SD_FLAGS, BX_SD_UPDATE_BODY_MASS, def.updateBodyMass );
	bxDefSetFlag( BX_SD_FLAGS, BX_SD_ENABLE_CUSTOM_FILTERING, def.enableCustomFiltering );
	bxDefSetFlag( BX_SD_FLAGS, BX_SD_ENABLE_SPECULATIVE_CONTACT, def.enableSpeculativeContact );
	bx_def[BX_SD_CUSTOM_COLOR].u = def.baseMaterial.customColor;
}

// Per-triangle materials staged by bx_Def_StageMaterials, consumed by the next shape creation.
#define BX_MAX_STAGED_MATERIALS 255
static b3SurfaceMaterial s_stagedMaterials[BX_MAX_STAGED_MATERIALS];
static int s_stagedMaterialCount;

/// data: 9 floats per material [friction, restitution, rollingResistance, tx, ty, tz, userMaterialLo, userMaterialHi, color].
/// The next shape creation takes them; mesh triangles index into them.
BX_EXPORT int bx_Def_StageMaterials( const float* data, int count )
{
	if ( count < 0 || count > BX_MAX_STAGED_MATERIALS )
	{
		return 0;
	}
	for ( int i = 0; i < count; ++i )
	{
		const float* m = data + 9 * i;
		const uint32_t* u = (const uint32_t*)m;
		b3SurfaceMaterial material = b3DefaultSurfaceMaterial();
		material.friction = m[0];
		material.restitution = m[1];
		material.rollingResistance = m[2];
		material.tangentVelocity = bxVec3( m[3], m[4], m[5] );
		material.userMaterialId = (uint64_t)u[6] | ( (uint64_t)u[7] << 32 );
		material.customColor = u[8];
		s_stagedMaterials[i] = material;
	}
	s_stagedMaterialCount = count;
	return 1;
}

static b3ShapeDef bxReadShapeDef( int slot )
{
	b3ShapeDef def = b3DefaultShapeDef();
	if ( s_stagedMaterialCount > 0 )
	{
		def.materials = s_stagedMaterials;
		def.materialCount = s_stagedMaterialCount;
		s_stagedMaterialCount = 0;
	}
	def.userData = (void*)(intptr_t)slot;
	def.density = bx_def[BX_SD_DENSITY].f;
	def.baseMaterial.friction = bx_def[BX_SD_FRICTION].f;
	def.baseMaterial.restitution = bx_def[BX_SD_RESTITUTION].f;
	def.baseMaterial.rollingResistance = bx_def[BX_SD_ROLLING_RESISTANCE].f;
	def.baseMaterial.tangentVelocity = bxDefVec3( BX_SD_TANGENT_VELOCITY );
	def.baseMaterial.userMaterialId = bxDefU64( BX_SD_USER_MATERIAL_ID );
	def.baseMaterial.customColor = bx_def[BX_SD_CUSTOM_COLOR].u;
	def.explosionScale = bx_def[BX_SD_EXPLOSION_SCALE].f;
	def.filter.categoryBits = bxDefU64( BX_SD_CATEGORY_BITS );
	def.filter.maskBits = bxDefU64( BX_SD_MASK_BITS );
	def.filter.groupIndex = bx_def[BX_SD_GROUP_INDEX].i;
	def.isSensor = bxDefFlag( BX_SD_FLAGS, BX_SD_IS_SENSOR );
	def.enableSensorEvents = bxDefFlag( BX_SD_FLAGS, BX_SD_ENABLE_SENSOR_EVENTS );
	def.enableContactEvents = bxDefFlag( BX_SD_FLAGS, BX_SD_ENABLE_CONTACT_EVENTS );
	def.enableHitEvents = bxDefFlag( BX_SD_FLAGS, BX_SD_ENABLE_HIT_EVENTS );
	def.enablePreSolveEvents = bxDefFlag( BX_SD_FLAGS, BX_SD_ENABLE_PRE_SOLVE_EVENTS );
	def.invokeContactCreation = bxDefFlag( BX_SD_FLAGS, BX_SD_INVOKE_CONTACT_CREATION );
	def.updateBodyMass = bxDefFlag( BX_SD_FLAGS, BX_SD_UPDATE_BODY_MASS );
	def.enableCustomFiltering = bxDefFlag( BX_SD_FLAGS, BX_SD_ENABLE_CUSTOM_FILTERING );
	def.enableSpeculativeContact = bxDefFlag( BX_SD_FLAGS, BX_SD_ENABLE_SPECULATIVE_CONTACT );
	return def;
}

b3ShapeDef bxReadShapeDefPublic( int slot )
{
	return bxReadShapeDef( slot );
}

// Every creator: allocate the slot first so the shape's userData is its slot,
// release it when the engine refuses.
static int bxFinishShape( int slot, int body, b3ShapeId id )
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
	return slot;
}

BX_EXPORT int bx_CreateSphereShape( int body, float cx, float cy, float cz, float radius )
{
	b3BodyId bodyId = bxBodyId( body );
	if ( B3_IS_NULL( bodyId ) )
	{
		return 0;
	}
	int slot = bxTable_Alloc( &bx_shapes );
	b3ShapeDef def = bxReadShapeDef( slot );
	b3Sphere sphere = { bxVec3( cx, cy, cz ), radius };
	return bxFinishShape( slot, body, b3CreateSphereShape( bodyId, &def, &sphere ) );
}

BX_EXPORT int bx_CreateCapsuleShape( int body, float ax, float ay, float az, float bx, float by, float bz, float radius )
{
	b3BodyId bodyId = bxBodyId( body );
	if ( B3_IS_NULL( bodyId ) )
	{
		return 0;
	}
	int slot = bxTable_Alloc( &bx_shapes );
	b3ShapeDef def = bxReadShapeDef( slot );
	b3Capsule capsule = { bxVec3( ax, ay, az ), bxVec3( bx, by, bz ), radius };
	return bxFinishShape( slot, body, b3CreateCapsuleShape( bodyId, &def, &capsule ) );
}

/// A box is a hull; offset and rotation are baked into its points.
BX_EXPORT int bx_CreateBoxShape( int body, float hx, float hy, float hz, float px, float py, float pz, float qx, float qy,
								 float qz, float qw )
{
	b3BodyId bodyId = bxBodyId( body );
	if ( B3_IS_NULL( bodyId ) )
	{
		return 0;
	}
	int slot = bxTable_Alloc( &bx_shapes );
	b3ShapeDef def = bxReadShapeDef( slot );
	b3Transform xf = { bxVec3( px, py, pz ), bxUnitQuat( qx, qy, qz, qw ) };
	int identity = px == 0.0f && py == 0.0f && pz == 0.0f && qx == 0.0f && qy == 0.0f && qz == 0.0f && qw == 1.0f;
	b3BoxHull box = identity ? b3MakeBoxHull( hx, hy, hz ) : b3MakeTransformedBoxHull( hx, hy, hz, xf );
	return bxFinishShape( slot, body, b3CreateHullShape( bodyId, &def, &box.base ) );
}

/// points: xyz triples in wasm memory. Returns 0 when no hull can be built.
BX_EXPORT int bx_CreateHullShape( int body, const float* points, int pointCount, int maxVertices )
{
	b3BodyId bodyId = bxBodyId( body );
	if ( B3_IS_NULL( bodyId ) || points == NULL || pointCount < 4 )
	{
		return 0;
	}
	b3HullData* hull = b3CreateHull( (const b3Vec3*)points, pointCount, maxVertices );
	if ( hull == NULL )
	{
		return 0;
	}
	int slot = bxTable_Alloc( &bx_shapes );
	b3ShapeDef def = bxReadShapeDef( slot );
	// the world clones the hull into its hull database, so the temporary goes right away
	b3ShapeId id = b3CreateHullShape( bodyId, &def, hull );
	b3DestroyHull( hull );
	return bxFinishShape( slot, body, id );
}

BX_EXPORT void bx_DestroyShape( int slot, int updateBodyMass )
{
	bxShape* shape = bxTable_Get( &bx_shapes, slot );
	if ( shape == NULL || shape->alive == 0 )
	{
		return;
	}
	if ( b3Shape_IsValid( shape->id ) )
	{
		b3DestroyShape( shape->id, updateBodyMass != 0 );
	}
	bxShapeSlotFree( slot );
}

BX_EXPORT int bx_Shape_IsValid( int slot )
{
	b3ShapeId shapeId = bxShapeId( slot );
	return B3_IS_NON_NULL( shapeId ) && b3Shape_IsValid( shapeId );
}

BX_EXPORT int bx_Shape_GetBody( int slot )
{
	bxShape* shape = bxTable_Get( &bx_shapes, slot );
	return shape != NULL && shape->alive ? shape->body : 0;
}

/// b3ShapeType: 0 capsule, 1 compound, 2 height field, 3 hull, 4 mesh, 5 sphere
BX_EXPORT int bx_Shape_GetType( int slot )
{
	BX_SHAPE_RET( slot, -1 );
	return (int)b3Shape_GetType( shapeId );
}

BX_EXPORT float bx_Shape_GetDensity( int slot )
{
	BX_SHAPE_RET( slot, 0.0f );
	return b3Shape_GetDensity( shapeId );
}

BX_EXPORT void bx_Shape_SetDensity( int slot, float density, int updateBodyMass )
{
	BX_SHAPE( slot );
	b3Shape_SetDensity( shapeId, density, updateBodyMass != 0 );
}

BX_EXPORT float bx_Shape_GetFriction( int slot )
{
	BX_SHAPE_RET( slot, 0.0f );
	return b3Shape_GetFriction( shapeId );
}

BX_EXPORT void bx_Shape_SetFriction( int slot, float friction )
{
	BX_SHAPE( slot );
	b3Shape_SetFriction( shapeId, friction );
}

BX_EXPORT float bx_Shape_GetRestitution( int slot )
{
	BX_SHAPE_RET( slot, 0.0f );
	return b3Shape_GetRestitution( shapeId );
}

BX_EXPORT void bx_Shape_SetRestitution( int slot, float restitution )
{
	BX_SHAPE( slot );
	b3Shape_SetRestitution( shapeId, restitution );
}

BX_EXPORT float bx_Shape_GetRollingResistance( int slot )
{
	BX_SHAPE_RET( slot, 0.0f );
	return b3Shape_GetSurfaceMaterial( shapeId ).rollingResistance;
}

BX_EXPORT void bx_Shape_SetRollingResistance( int slot, float value )
{
	BX_SHAPE( slot );
	b3SurfaceMaterial material = b3Shape_GetSurfaceMaterial( shapeId );
	material.rollingResistance = value;
	b3Shape_SetSurfaceMaterial( shapeId, material );
}

/// scratch: [x, y, z]
BX_EXPORT void bx_Shape_GetTangentVelocity( int slot )
{
	BX_SHAPE( slot );
	bxScratchVec3( 0, b3Shape_GetSurfaceMaterial( shapeId ).tangentVelocity );
}

BX_EXPORT void bx_Shape_SetTangentVelocity( int slot, float x, float y, float z )
{
	BX_SHAPE( slot );
	b3SurfaceMaterial material = b3Shape_GetSurfaceMaterial( shapeId );
	material.tangentVelocity = bxVec3( x, y, z );
	b3Shape_SetSurfaceMaterial( shapeId, material );
}

/// scratch (u32): [lo, hi]
BX_EXPORT void bx_Shape_GetUserMaterialId( int slot )
{
	BX_SHAPE( slot );
	uint64_t id = b3Shape_GetSurfaceMaterial( shapeId ).userMaterialId;
	bx_scratch[0].u = (uint32_t)( id & 0xffffffffu );
	bx_scratch[1].u = (uint32_t)( id >> 32 );
}

BX_EXPORT void bx_Shape_SetUserMaterialId( int slot, uint32_t lo, uint32_t hi )
{
	BX_SHAPE( slot );
	b3SurfaceMaterial material = b3Shape_GetSurfaceMaterial( shapeId );
	material.userMaterialId = (uint64_t)lo | ( (uint64_t)hi << 32 );
	b3Shape_SetSurfaceMaterial( shapeId, material );
}

BX_EXPORT int bx_Shape_IsSensor( int slot )
{
	BX_SHAPE_RET( slot, 0 );
	return b3Shape_IsSensor( shapeId );
}

BX_EXPORT void bx_Shape_EnableSensorEvents( int slot, int flag )
{
	BX_SHAPE( slot );
	b3Shape_EnableSensorEvents( shapeId, flag != 0 );
}

BX_EXPORT int bx_Shape_AreSensorEventsEnabled( int slot )
{
	BX_SHAPE_RET( slot, 0 );
	return b3Shape_AreSensorEventsEnabled( shapeId );
}

BX_EXPORT void bx_Shape_EnableContactEvents( int slot, int flag )
{
	BX_SHAPE( slot );
	b3Shape_EnableContactEvents( shapeId, flag != 0 );
}

BX_EXPORT int bx_Shape_AreContactEventsEnabled( int slot )
{
	BX_SHAPE_RET( slot, 0 );
	return b3Shape_AreContactEventsEnabled( shapeId );
}

BX_EXPORT void bx_Shape_EnableHitEvents( int slot, int flag )
{
	BX_SHAPE( slot );
	b3Shape_EnableHitEvents( shapeId, flag != 0 );
}

BX_EXPORT int bx_Shape_AreHitEventsEnabled( int slot )
{
	BX_SHAPE_RET( slot, 0 );
	return b3Shape_AreHitEventsEnabled( shapeId );
}

/// scratch (u32): [categoryLo, categoryHi, maskLo, maskHi, groupIndex (i32)]
BX_EXPORT void bx_Shape_GetFilter( int slot )
{
	BX_SHAPE( slot );
	b3Filter filter = b3Shape_GetFilter( shapeId );
	bx_scratch[0].u = (uint32_t)( filter.categoryBits & 0xffffffffu );
	bx_scratch[1].u = (uint32_t)( filter.categoryBits >> 32 );
	bx_scratch[2].u = (uint32_t)( filter.maskBits & 0xffffffffu );
	bx_scratch[3].u = (uint32_t)( filter.maskBits >> 32 );
	bx_scratch[4].i = filter.groupIndex;
}

BX_EXPORT void bx_Shape_SetFilter( int slot, uint32_t categoryLo, uint32_t categoryHi, uint32_t maskLo, uint32_t maskHi,
								   int groupIndex, int invokeContacts )
{
	BX_SHAPE( slot );
	b3Filter filter;
	filter.categoryBits = (uint64_t)categoryLo | ( (uint64_t)categoryHi << 32 );
	filter.maskBits = (uint64_t)maskLo | ( (uint64_t)maskHi << 32 );
	filter.groupIndex = groupIndex;
	b3Shape_SetFilter( shapeId, filter, invokeContacts != 0 );
}

/// scratch: [lx, ly, lz, ux, uy, uz]
BX_EXPORT void bx_Shape_GetAABB( int slot )
{
	BX_SHAPE( slot );
	b3AABB aabb = b3Shape_GetAABB( shapeId );
	bxScratchVec3( 0, aabb.lowerBound );
	bxScratchVec3( 3, aabb.upperBound );
}

/// scratch: [mass, cx, cy, cz, inertia column major x9]
BX_EXPORT void bx_Shape_ComputeMassData( int slot )
{
	BX_SHAPE( slot );
	b3MassData md = b3Shape_ComputeMassData( shapeId );
	bx_scratch[0].f = md.mass;
	bxScratchVec3( 1, md.center );
	bxScratchMat3( 4, md.inertia );
}

/// Returns 1 on a hit; scratch: [px, py, pz, nx, ny, nz, fraction, triangleIndex (i32)]
BX_EXPORT int bx_Shape_RayCast( int slot, float ox, float oy, float oz, float dx, float dy, float dz )
{
	BX_SHAPE_RET( slot, 0 );
	b3WorldCastOutput out = b3Shape_RayCast( shapeId, bxVec3( ox, oy, oz ), bxVec3( dx, dy, dz ) );
	if ( out.hit == false )
	{
		return 0;
	}
	bxScratchVec3( 0, out.point );
	bxScratchVec3( 3, out.normal );
	bx_scratch[6].f = out.fraction;
	bx_scratch[7].i = out.triangleIndex;
	return 1;
}
