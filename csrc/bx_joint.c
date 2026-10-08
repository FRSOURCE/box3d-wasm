// Joints: the base def block plus one per-type block in the def buffer, base
// accessors, and the per-type setters and getters.
#include "bx.h"

#define BX_JOINT( slot )                                                                                                         \
	b3JointId jointId = bxJointId( slot );                                                                                       \
	if ( B3_IS_NULL( jointId ) )                                                                                                 \
	{                                                                                                                            \
		return;                                                                                                                  \
	}

#define BX_JOINT_RET( slot, value )                                                                                              \
	b3JointId jointId = bxJointId( slot );                                                                                       \
	if ( B3_IS_NULL( jointId ) )                                                                                                 \
	{                                                                                                                            \
		return value;                                                                                                            \
	}

static b3Vec3 bxVec3( float x, float y, float z )
{
	b3Vec3 v = { x, y, z };
	return v;
}

static b3Quat bxQuat( float x, float y, float z, float w )
{
	b3Quat q = { { x, y, z }, w };
	return b3IsNormalizedQuat( q ) ? q : b3NormalizeQuat( q );
}

// ---------------------------------------------------------------------------
// Def buffer: base block
// ---------------------------------------------------------------------------

static void bxWriteJointBase( const b3JointDef* base )
{
	bxDefSetTransform( BX_JD_LOCAL_FRAME_A, base->localFrameA );
	bxDefSetTransform( BX_JD_LOCAL_FRAME_B, base->localFrameB );
	bx_def[BX_JD_FORCE_THRESHOLD].f = base->forceThreshold;
	bx_def[BX_JD_TORQUE_THRESHOLD].f = base->torqueThreshold;
	bx_def[BX_JD_CONSTRAINT_HERTZ].f = base->constraintHertz;
	bx_def[BX_JD_CONSTRAINT_DAMPING_RATIO].f = base->constraintDampingRatio;
	bx_def[BX_JD_DRAW_SCALE].f = base->drawScale;
	bx_def[BX_JD_FLAGS].u = 0;
	bxDefSetFlag( BX_JD_FLAGS, BX_JD_COLLIDE_CONNECTED, base->collideConnected );
}

static int bxReadJointBase( b3JointDef* base, int world, int bodyA, int bodyB, int slot )
{
	b3BodyId a = bxBodyId( bodyA );
	b3BodyId b = bxBodyId( bodyB );
	if ( B3_IS_NULL( bxWorldId( world ) ) || B3_IS_NULL( a ) || B3_IS_NULL( b ) )
	{
		return 0;
	}
	// a body id from another world would index the wrong body table; release builds have no assert for it
	bxBody* bodyTableA = bxTable_Get( &bx_bodies, bodyA );
	bxBody* bodyTableB = bxTable_Get( &bx_bodies, bodyB );
	if ( bodyTableA->world != world || bodyTableB->world != world )
	{
		return 0;
	}
	base->bodyIdA = a;
	base->bodyIdB = b;
	base->userData = (void*)(intptr_t)slot;
	base->localFrameA = bxDefTransform( BX_JD_LOCAL_FRAME_A );
	base->localFrameB = bxDefTransform( BX_JD_LOCAL_FRAME_B );
	base->forceThreshold = bx_def[BX_JD_FORCE_THRESHOLD].f;
	base->torqueThreshold = bx_def[BX_JD_TORQUE_THRESHOLD].f;
	base->constraintHertz = bx_def[BX_JD_CONSTRAINT_HERTZ].f;
	base->constraintDampingRatio = bx_def[BX_JD_CONSTRAINT_DAMPING_RATIO].f;
	base->drawScale = bx_def[BX_JD_DRAW_SCALE].f;
	base->collideConnected = bxDefFlag( BX_JD_FLAGS, BX_JD_COLLIDE_CONNECTED );
	return 1;
}

static int bxFinishJoint( int slot, int world, b3JointType type, b3JointId id )
{
	if ( B3_IS_NULL( id ) )
	{
		bxTable_Free( &bx_joints, slot );
		return 0;
	}
	bxJoint* joint = bxTable_Get( &bx_joints, slot );
	joint->id = id;
	joint->world = world;
	joint->type = type;
	joint->alive = 1;
	return slot;
}

// ---------------------------------------------------------------------------
// Defaults and creation, one pair per type
// ---------------------------------------------------------------------------

BX_EXPORT void bx_DistanceJointDef_Default( void )
{
	b3DistanceJointDef def = b3DefaultDistanceJointDef();
	bxWriteJointBase( &def.base );
	bx_def[BX_DJ_LENGTH].f = def.length;
	bx_def[BX_DJ_LOWER_SPRING_FORCE].f = def.lowerSpringForce;
	bx_def[BX_DJ_UPPER_SPRING_FORCE].f = def.upperSpringForce;
	bx_def[BX_DJ_HERTZ].f = def.hertz;
	bx_def[BX_DJ_DAMPING_RATIO].f = def.dampingRatio;
	bx_def[BX_DJ_MIN_LENGTH].f = def.minLength;
	bx_def[BX_DJ_MAX_LENGTH].f = def.maxLength;
	bx_def[BX_DJ_MAX_MOTOR_FORCE].f = def.maxMotorForce;
	bx_def[BX_DJ_MOTOR_SPEED].f = def.motorSpeed;
	bx_def[BX_DJ_FLAGS].u = 0;
	bxDefSetFlag( BX_DJ_FLAGS, 0, def.enableSpring );
	bxDefSetFlag( BX_DJ_FLAGS, 1, def.enableLimit );
	bxDefSetFlag( BX_DJ_FLAGS, 2, def.enableMotor );
}

BX_EXPORT int bx_CreateDistanceJoint( int world, int bodyA, int bodyB )
{
	int slot = bxTable_Alloc( &bx_joints );
	b3DistanceJointDef def = b3DefaultDistanceJointDef();
	if ( bxReadJointBase( &def.base, world, bodyA, bodyB, slot ) == 0 )
	{
		bxTable_Free( &bx_joints, slot );
		return 0;
	}
	def.length = bx_def[BX_DJ_LENGTH].f;
	def.lowerSpringForce = bx_def[BX_DJ_LOWER_SPRING_FORCE].f;
	def.upperSpringForce = bx_def[BX_DJ_UPPER_SPRING_FORCE].f;
	def.hertz = bx_def[BX_DJ_HERTZ].f;
	def.dampingRatio = bx_def[BX_DJ_DAMPING_RATIO].f;
	def.minLength = bx_def[BX_DJ_MIN_LENGTH].f;
	def.maxLength = bx_def[BX_DJ_MAX_LENGTH].f;
	def.maxMotorForce = bx_def[BX_DJ_MAX_MOTOR_FORCE].f;
	def.motorSpeed = bx_def[BX_DJ_MOTOR_SPEED].f;
	def.enableSpring = bxDefFlag( BX_DJ_FLAGS, 0 );
	def.enableLimit = bxDefFlag( BX_DJ_FLAGS, 1 );
	def.enableMotor = bxDefFlag( BX_DJ_FLAGS, 2 );
	return bxFinishJoint( slot, world, b3_distanceJoint, b3CreateDistanceJoint( bxWorldId( world ), &def ) );
}

BX_EXPORT void bx_RevoluteJointDef_Default( void )
{
	b3RevoluteJointDef def = b3DefaultRevoluteJointDef();
	bxWriteJointBase( &def.base );
	bx_def[BX_RJ_TARGET_ANGLE].f = def.targetAngle;
	bx_def[BX_RJ_HERTZ].f = def.hertz;
	bx_def[BX_RJ_DAMPING_RATIO].f = def.dampingRatio;
	bx_def[BX_RJ_LOWER_ANGLE].f = def.lowerAngle;
	bx_def[BX_RJ_UPPER_ANGLE].f = def.upperAngle;
	bx_def[BX_RJ_MAX_MOTOR_TORQUE].f = def.maxMotorTorque;
	bx_def[BX_RJ_MOTOR_SPEED].f = def.motorSpeed;
	bx_def[BX_RJ_FLAGS].u = 0;
	bxDefSetFlag( BX_RJ_FLAGS, 0, def.enableSpring );
	bxDefSetFlag( BX_RJ_FLAGS, 1, def.enableLimit );
	bxDefSetFlag( BX_RJ_FLAGS, 2, def.enableMotor );
}

BX_EXPORT int bx_CreateRevoluteJoint( int world, int bodyA, int bodyB )
{
	int slot = bxTable_Alloc( &bx_joints );
	b3RevoluteJointDef def = b3DefaultRevoluteJointDef();
	if ( bxReadJointBase( &def.base, world, bodyA, bodyB, slot ) == 0 )
	{
		bxTable_Free( &bx_joints, slot );
		return 0;
	}
	def.targetAngle = bx_def[BX_RJ_TARGET_ANGLE].f;
	def.hertz = bx_def[BX_RJ_HERTZ].f;
	def.dampingRatio = bx_def[BX_RJ_DAMPING_RATIO].f;
	def.lowerAngle = bx_def[BX_RJ_LOWER_ANGLE].f;
	def.upperAngle = bx_def[BX_RJ_UPPER_ANGLE].f;
	def.maxMotorTorque = bx_def[BX_RJ_MAX_MOTOR_TORQUE].f;
	def.motorSpeed = bx_def[BX_RJ_MOTOR_SPEED].f;
	def.enableSpring = bxDefFlag( BX_RJ_FLAGS, 0 );
	def.enableLimit = bxDefFlag( BX_RJ_FLAGS, 1 );
	def.enableMotor = bxDefFlag( BX_RJ_FLAGS, 2 );
	return bxFinishJoint( slot, world, b3_revoluteJoint, b3CreateRevoluteJoint( bxWorldId( world ), &def ) );
}

BX_EXPORT void bx_SphericalJointDef_Default( void )
{
	b3SphericalJointDef def = b3DefaultSphericalJointDef();
	bxWriteJointBase( &def.base );
	bx_def[BX_SJ_HERTZ].f = def.hertz;
	bx_def[BX_SJ_DAMPING_RATIO].f = def.dampingRatio;
	bxDefSetQuat( BX_SJ_TARGET_ROTATION, def.targetRotation );
	bx_def[BX_SJ_CONE_ANGLE].f = def.coneAngle;
	bx_def[BX_SJ_LOWER_TWIST_ANGLE].f = def.lowerTwistAngle;
	bx_def[BX_SJ_UPPER_TWIST_ANGLE].f = def.upperTwistAngle;
	bx_def[BX_SJ_MAX_MOTOR_TORQUE].f = def.maxMotorTorque;
	bxDefSetVec3( BX_SJ_MOTOR_VELOCITY, def.motorVelocity );
	bx_def[BX_SJ_FLAGS].u = 0;
	bxDefSetFlag( BX_SJ_FLAGS, 0, def.enableSpring );
	bxDefSetFlag( BX_SJ_FLAGS, 1, def.enableConeLimit );
	bxDefSetFlag( BX_SJ_FLAGS, 2, def.enableTwistLimit );
	bxDefSetFlag( BX_SJ_FLAGS, 3, def.enableMotor );
}

BX_EXPORT int bx_CreateSphericalJoint( int world, int bodyA, int bodyB )
{
	int slot = bxTable_Alloc( &bx_joints );
	b3SphericalJointDef def = b3DefaultSphericalJointDef();
	if ( bxReadJointBase( &def.base, world, bodyA, bodyB, slot ) == 0 )
	{
		bxTable_Free( &bx_joints, slot );
		return 0;
	}
	def.hertz = bx_def[BX_SJ_HERTZ].f;
	def.dampingRatio = bx_def[BX_SJ_DAMPING_RATIO].f;
	def.targetRotation = bxDefQuat( BX_SJ_TARGET_ROTATION );
	def.coneAngle = bx_def[BX_SJ_CONE_ANGLE].f;
	def.lowerTwistAngle = bx_def[BX_SJ_LOWER_TWIST_ANGLE].f;
	def.upperTwistAngle = bx_def[BX_SJ_UPPER_TWIST_ANGLE].f;
	def.maxMotorTorque = bx_def[BX_SJ_MAX_MOTOR_TORQUE].f;
	def.motorVelocity = bxDefVec3( BX_SJ_MOTOR_VELOCITY );
	def.enableSpring = bxDefFlag( BX_SJ_FLAGS, 0 );
	def.enableConeLimit = bxDefFlag( BX_SJ_FLAGS, 1 );
	def.enableTwistLimit = bxDefFlag( BX_SJ_FLAGS, 2 );
	def.enableMotor = bxDefFlag( BX_SJ_FLAGS, 3 );
	return bxFinishJoint( slot, world, b3_sphericalJoint, b3CreateSphericalJoint( bxWorldId( world ), &def ) );
}

BX_EXPORT void bx_PrismaticJointDef_Default( void )
{
	b3PrismaticJointDef def = b3DefaultPrismaticJointDef();
	bxWriteJointBase( &def.base );
	bx_def[BX_PJ_HERTZ].f = def.hertz;
	bx_def[BX_PJ_DAMPING_RATIO].f = def.dampingRatio;
	bx_def[BX_PJ_TARGET_TRANSLATION].f = def.targetTranslation;
	bx_def[BX_PJ_LOWER_TRANSLATION].f = def.lowerTranslation;
	bx_def[BX_PJ_UPPER_TRANSLATION].f = def.upperTranslation;
	bx_def[BX_PJ_MAX_MOTOR_FORCE].f = def.maxMotorForce;
	bx_def[BX_PJ_MOTOR_SPEED].f = def.motorSpeed;
	bx_def[BX_PJ_FLAGS].u = 0;
	bxDefSetFlag( BX_PJ_FLAGS, 0, def.enableSpring );
	bxDefSetFlag( BX_PJ_FLAGS, 1, def.enableLimit );
	bxDefSetFlag( BX_PJ_FLAGS, 2, def.enableMotor );
}

BX_EXPORT int bx_CreatePrismaticJoint( int world, int bodyA, int bodyB )
{
	int slot = bxTable_Alloc( &bx_joints );
	b3PrismaticJointDef def = b3DefaultPrismaticJointDef();
	if ( bxReadJointBase( &def.base, world, bodyA, bodyB, slot ) == 0 )
	{
		bxTable_Free( &bx_joints, slot );
		return 0;
	}
	def.hertz = bx_def[BX_PJ_HERTZ].f;
	def.dampingRatio = bx_def[BX_PJ_DAMPING_RATIO].f;
	def.targetTranslation = bx_def[BX_PJ_TARGET_TRANSLATION].f;
	def.lowerTranslation = bx_def[BX_PJ_LOWER_TRANSLATION].f;
	def.upperTranslation = bx_def[BX_PJ_UPPER_TRANSLATION].f;
	def.maxMotorForce = bx_def[BX_PJ_MAX_MOTOR_FORCE].f;
	def.motorSpeed = bx_def[BX_PJ_MOTOR_SPEED].f;
	def.enableSpring = bxDefFlag( BX_PJ_FLAGS, 0 );
	def.enableLimit = bxDefFlag( BX_PJ_FLAGS, 1 );
	def.enableMotor = bxDefFlag( BX_PJ_FLAGS, 2 );
	return bxFinishJoint( slot, world, b3_prismaticJoint, b3CreatePrismaticJoint( bxWorldId( world ), &def ) );
}

BX_EXPORT void bx_WeldJointDef_Default( void )
{
	b3WeldJointDef def = b3DefaultWeldJointDef();
	bxWriteJointBase( &def.base );
	bx_def[BX_WJ_LINEAR_HERTZ].f = def.linearHertz;
	bx_def[BX_WJ_ANGULAR_HERTZ].f = def.angularHertz;
	bx_def[BX_WJ_LINEAR_DAMPING_RATIO].f = def.linearDampingRatio;
	bx_def[BX_WJ_ANGULAR_DAMPING_RATIO].f = def.angularDampingRatio;
}

BX_EXPORT int bx_CreateWeldJoint( int world, int bodyA, int bodyB )
{
	int slot = bxTable_Alloc( &bx_joints );
	b3WeldJointDef def = b3DefaultWeldJointDef();
	if ( bxReadJointBase( &def.base, world, bodyA, bodyB, slot ) == 0 )
	{
		bxTable_Free( &bx_joints, slot );
		return 0;
	}
	def.linearHertz = bx_def[BX_WJ_LINEAR_HERTZ].f;
	def.angularHertz = bx_def[BX_WJ_ANGULAR_HERTZ].f;
	def.linearDampingRatio = bx_def[BX_WJ_LINEAR_DAMPING_RATIO].f;
	def.angularDampingRatio = bx_def[BX_WJ_ANGULAR_DAMPING_RATIO].f;
	return bxFinishJoint( slot, world, b3_weldJoint, b3CreateWeldJoint( bxWorldId( world ), &def ) );
}

BX_EXPORT void bx_MotorJointDef_Default( void )
{
	b3MotorJointDef def = b3DefaultMotorJointDef();
	bxWriteJointBase( &def.base );
	bxDefSetVec3( BX_MJ_LINEAR_VELOCITY, def.linearVelocity );
	bx_def[BX_MJ_MAX_VELOCITY_FORCE].f = def.maxVelocityForce;
	bxDefSetVec3( BX_MJ_ANGULAR_VELOCITY, def.angularVelocity );
	bx_def[BX_MJ_MAX_VELOCITY_TORQUE].f = def.maxVelocityTorque;
	bx_def[BX_MJ_LINEAR_HERTZ].f = def.linearHertz;
	bx_def[BX_MJ_LINEAR_DAMPING_RATIO].f = def.linearDampingRatio;
	bx_def[BX_MJ_MAX_SPRING_FORCE].f = def.maxSpringForce;
	bx_def[BX_MJ_ANGULAR_HERTZ].f = def.angularHertz;
	bx_def[BX_MJ_ANGULAR_DAMPING_RATIO].f = def.angularDampingRatio;
	bx_def[BX_MJ_MAX_SPRING_TORQUE].f = def.maxSpringTorque;
}

BX_EXPORT int bx_CreateMotorJoint( int world, int bodyA, int bodyB )
{
	int slot = bxTable_Alloc( &bx_joints );
	b3MotorJointDef def = b3DefaultMotorJointDef();
	if ( bxReadJointBase( &def.base, world, bodyA, bodyB, slot ) == 0 )
	{
		bxTable_Free( &bx_joints, slot );
		return 0;
	}
	def.linearVelocity = bxDefVec3( BX_MJ_LINEAR_VELOCITY );
	def.maxVelocityForce = bx_def[BX_MJ_MAX_VELOCITY_FORCE].f;
	def.angularVelocity = bxDefVec3( BX_MJ_ANGULAR_VELOCITY );
	def.maxVelocityTorque = bx_def[BX_MJ_MAX_VELOCITY_TORQUE].f;
	def.linearHertz = bx_def[BX_MJ_LINEAR_HERTZ].f;
	def.linearDampingRatio = bx_def[BX_MJ_LINEAR_DAMPING_RATIO].f;
	def.maxSpringForce = bx_def[BX_MJ_MAX_SPRING_FORCE].f;
	def.angularHertz = bx_def[BX_MJ_ANGULAR_HERTZ].f;
	def.angularDampingRatio = bx_def[BX_MJ_ANGULAR_DAMPING_RATIO].f;
	def.maxSpringTorque = bx_def[BX_MJ_MAX_SPRING_TORQUE].f;
	return bxFinishJoint( slot, world, b3_motorJoint, b3CreateMotorJoint( bxWorldId( world ), &def ) );
}

BX_EXPORT void bx_WheelJointDef_Default( void )
{
	b3WheelJointDef def = b3DefaultWheelJointDef();
	bxWriteJointBase( &def.base );
	bx_def[BX_WHJ_SUSPENSION_HERTZ].f = def.suspensionHertz;
	bx_def[BX_WHJ_SUSPENSION_DAMPING_RATIO].f = def.suspensionDampingRatio;
	bx_def[BX_WHJ_LOWER_SUSPENSION_LIMIT].f = def.lowerSuspensionLimit;
	bx_def[BX_WHJ_UPPER_SUSPENSION_LIMIT].f = def.upperSuspensionLimit;
	bx_def[BX_WHJ_MAX_SPIN_TORQUE].f = def.maxSpinTorque;
	bx_def[BX_WHJ_SPIN_SPEED].f = def.spinSpeed;
	bx_def[BX_WHJ_STEERING_HERTZ].f = def.steeringHertz;
	bx_def[BX_WHJ_STEERING_DAMPING_RATIO].f = def.steeringDampingRatio;
	bx_def[BX_WHJ_TARGET_STEERING_ANGLE].f = def.targetSteeringAngle;
	bx_def[BX_WHJ_MAX_STEERING_TORQUE].f = def.maxSteeringTorque;
	bx_def[BX_WHJ_LOWER_STEERING_LIMIT].f = def.lowerSteeringLimit;
	bx_def[BX_WHJ_UPPER_STEERING_LIMIT].f = def.upperSteeringLimit;
	bx_def[BX_WHJ_FLAGS].u = 0;
	bxDefSetFlag( BX_WHJ_FLAGS, 0, def.enableSuspensionSpring );
	bxDefSetFlag( BX_WHJ_FLAGS, 1, def.enableSuspensionLimit );
	bxDefSetFlag( BX_WHJ_FLAGS, 2, def.enableSpinMotor );
	bxDefSetFlag( BX_WHJ_FLAGS, 3, def.enableSteering );
	bxDefSetFlag( BX_WHJ_FLAGS, 4, def.enableSteeringLimit );
}

BX_EXPORT int bx_CreateWheelJoint( int world, int bodyA, int bodyB )
{
	int slot = bxTable_Alloc( &bx_joints );
	b3WheelJointDef def = b3DefaultWheelJointDef();
	if ( bxReadJointBase( &def.base, world, bodyA, bodyB, slot ) == 0 )
	{
		bxTable_Free( &bx_joints, slot );
		return 0;
	}
	def.suspensionHertz = bx_def[BX_WHJ_SUSPENSION_HERTZ].f;
	def.suspensionDampingRatio = bx_def[BX_WHJ_SUSPENSION_DAMPING_RATIO].f;
	def.lowerSuspensionLimit = bx_def[BX_WHJ_LOWER_SUSPENSION_LIMIT].f;
	def.upperSuspensionLimit = bx_def[BX_WHJ_UPPER_SUSPENSION_LIMIT].f;
	def.maxSpinTorque = bx_def[BX_WHJ_MAX_SPIN_TORQUE].f;
	def.spinSpeed = bx_def[BX_WHJ_SPIN_SPEED].f;
	def.steeringHertz = bx_def[BX_WHJ_STEERING_HERTZ].f;
	def.steeringDampingRatio = bx_def[BX_WHJ_STEERING_DAMPING_RATIO].f;
	def.targetSteeringAngle = bx_def[BX_WHJ_TARGET_STEERING_ANGLE].f;
	def.maxSteeringTorque = bx_def[BX_WHJ_MAX_STEERING_TORQUE].f;
	def.lowerSteeringLimit = bx_def[BX_WHJ_LOWER_STEERING_LIMIT].f;
	def.upperSteeringLimit = bx_def[BX_WHJ_UPPER_STEERING_LIMIT].f;
	def.enableSuspensionSpring = bxDefFlag( BX_WHJ_FLAGS, 0 );
	def.enableSuspensionLimit = bxDefFlag( BX_WHJ_FLAGS, 1 );
	def.enableSpinMotor = bxDefFlag( BX_WHJ_FLAGS, 2 );
	def.enableSteering = bxDefFlag( BX_WHJ_FLAGS, 3 );
	def.enableSteeringLimit = bxDefFlag( BX_WHJ_FLAGS, 4 );
	return bxFinishJoint( slot, world, b3_wheelJoint, b3CreateWheelJoint( bxWorldId( world ), &def ) );
}

BX_EXPORT void bx_ParallelJointDef_Default( void )
{
	b3ParallelJointDef def = b3DefaultParallelJointDef();
	bxWriteJointBase( &def.base );
	bx_def[BX_PLJ_HERTZ].f = def.hertz;
	bx_def[BX_PLJ_DAMPING_RATIO].f = def.dampingRatio;
	bx_def[BX_PLJ_MAX_TORQUE].f = def.maxTorque;
}

BX_EXPORT int bx_CreateParallelJoint( int world, int bodyA, int bodyB )
{
	int slot = bxTable_Alloc( &bx_joints );
	b3ParallelJointDef def = b3DefaultParallelJointDef();
	if ( bxReadJointBase( &def.base, world, bodyA, bodyB, slot ) == 0 )
	{
		bxTable_Free( &bx_joints, slot );
		return 0;
	}
	def.hertz = bx_def[BX_PLJ_HERTZ].f;
	def.dampingRatio = bx_def[BX_PLJ_DAMPING_RATIO].f;
	def.maxTorque = bx_def[BX_PLJ_MAX_TORQUE].f;
	return bxFinishJoint( slot, world, b3_parallelJoint, b3CreateParallelJoint( bxWorldId( world ), &def ) );
}

BX_EXPORT void bx_FilterJointDef_Default( void )
{
	b3FilterJointDef def = b3DefaultFilterJointDef();
	bxWriteJointBase( &def.base );
}

BX_EXPORT int bx_CreateFilterJoint( int world, int bodyA, int bodyB )
{
	int slot = bxTable_Alloc( &bx_joints );
	b3FilterJointDef def = b3DefaultFilterJointDef();
	if ( bxReadJointBase( &def.base, world, bodyA, bodyB, slot ) == 0 )
	{
		bxTable_Free( &bx_joints, slot );
		return 0;
	}
	return bxFinishJoint( slot, world, b3_filterJoint, b3CreateFilterJoint( bxWorldId( world ), &def ) );
}

// ---------------------------------------------------------------------------
// Base
// ---------------------------------------------------------------------------

BX_EXPORT void bx_DestroyJoint( int slot, int wakeAttached )
{
	bxJoint* joint = bxJointAt( slot );
	if ( joint == NULL )
	{
		return;
	}
	if ( b3Joint_IsValid( joint->id ) )
	{
		b3DestroyJoint( joint->id, wakeAttached != 0 );
	}
	bxTable_Free( &bx_joints, slot );
}

BX_EXPORT int bx_Joint_IsValid( int slot )
{
	b3JointId jointId = bxJointId( slot );
	return B3_IS_NON_NULL( jointId ) && b3Joint_IsValid( jointId );
}

/// b3JointType: 0 parallel, 1 distance, 2 filter, 3 motor, 4 prismatic, 5 revolute, 6 spherical, 7 weld, 8 wheel
BX_EXPORT int bx_Joint_GetType( int slot )
{
	bxJoint* joint = bxJointAt( slot );
	return joint != NULL ? (int)joint->type : -1;
}

BX_EXPORT int bx_Joint_GetBodyA( int slot )
{
	BX_JOINT_RET( slot, 0 );
	return bxBodySlotOf( b3Joint_GetBodyA( jointId ) );
}

BX_EXPORT int bx_Joint_GetBodyB( int slot )
{
	BX_JOINT_RET( slot, 0 );
	return bxBodySlotOf( b3Joint_GetBodyB( jointId ) );
}

BX_EXPORT void bx_Joint_WakeBodies( int slot )
{
	BX_JOINT( slot );
	b3Joint_WakeBodies( jointId );
}

BX_EXPORT int bx_Joint_GetCollideConnected( int slot )
{
	BX_JOINT_RET( slot, 0 );
	return b3Joint_GetCollideConnected( jointId );
}

BX_EXPORT void bx_Joint_SetCollideConnected( int slot, int flag )
{
	BX_JOINT( slot );
	b3Joint_SetCollideConnected( jointId, flag != 0 );
}

/// scratch: [px, py, pz, qx, qy, qz, qw]
BX_EXPORT void bx_Joint_GetLocalFrameA( int slot )
{
	BX_JOINT( slot );
	bxScratchTransform( 0, b3Joint_GetLocalFrameA( jointId ) );
}

/// scratch: [px, py, pz, qx, qy, qz, qw]
BX_EXPORT void bx_Joint_GetLocalFrameB( int slot )
{
	BX_JOINT( slot );
	bxScratchTransform( 0, b3Joint_GetLocalFrameB( jointId ) );
}

BX_EXPORT void bx_Joint_SetLocalFrameA( int slot, float px, float py, float pz, float qx, float qy, float qz, float qw )
{
	BX_JOINT( slot );
	b3Transform xf = { bxVec3( px, py, pz ), bxQuat( qx, qy, qz, qw ) };
	b3Joint_SetLocalFrameA( jointId, xf );
}

BX_EXPORT void bx_Joint_SetLocalFrameB( int slot, float px, float py, float pz, float qx, float qy, float qz, float qw )
{
	BX_JOINT( slot );
	b3Transform xf = { bxVec3( px, py, pz ), bxQuat( qx, qy, qz, qw ) };
	b3Joint_SetLocalFrameB( jointId, xf );
}

/// scratch: [x, y, z]
BX_EXPORT void bx_Joint_GetConstraintForce( int slot )
{
	BX_JOINT( slot );
	bxScratchVec3( 0, b3Joint_GetConstraintForce( jointId ) );
}

/// scratch: [x, y, z]
BX_EXPORT void bx_Joint_GetConstraintTorque( int slot )
{
	BX_JOINT( slot );
	bxScratchVec3( 0, b3Joint_GetConstraintTorque( jointId ) );
}

BX_EXPORT void bx_Joint_SetConstraintTuning( int slot, float hertz, float dampingRatio )
{
	BX_JOINT( slot );
	b3Joint_SetConstraintTuning( jointId, hertz, dampingRatio );
}

/// scratch: [hertz, dampingRatio]
BX_EXPORT void bx_Joint_GetConstraintTuning( int slot )
{
	BX_JOINT( slot );
	float hertz = 0.0f;
	float dampingRatio = 0.0f;
	b3Joint_GetConstraintTuning( jointId, &hertz, &dampingRatio );
	bx_scratch[0].f = hertz;
	bx_scratch[1].f = dampingRatio;
}

BX_EXPORT void bx_Joint_SetForceThreshold( int slot, float threshold )
{
	BX_JOINT( slot );
	b3Joint_SetForceThreshold( jointId, threshold );
}

BX_EXPORT float bx_Joint_GetForceThreshold( int slot )
{
	BX_JOINT_RET( slot, 0.0f );
	return b3Joint_GetForceThreshold( jointId );
}

BX_EXPORT void bx_Joint_SetTorqueThreshold( int slot, float threshold )
{
	BX_JOINT( slot );
	b3Joint_SetTorqueThreshold( jointId, threshold );
}

BX_EXPORT float bx_Joint_GetTorqueThreshold( int slot )
{
	BX_JOINT_RET( slot, 0.0f );
	return b3Joint_GetTorqueThreshold( jointId );
}

BX_EXPORT float bx_Joint_GetLinearSeparation( int slot )
{
	BX_JOINT_RET( slot, 0.0f );
	return b3Joint_GetLinearSeparation( jointId );
}

BX_EXPORT float bx_Joint_GetAngularSeparation( int slot )
{
	BX_JOINT_RET( slot, 0.0f );
	return b3Joint_GetAngularSeparation( jointId );
}

// ---------------------------------------------------------------------------
// Per type. Setters take scalars; getters return them.
// ---------------------------------------------------------------------------

#define BX_SETTER_F( name, engine )                                                                                              \
	BX_EXPORT void bx_##name( int slot, float value )                                                                            \
	{                                                                                                                            \
		BX_JOINT( slot );                                                                                                        \
		engine( jointId, value );                                                                                                \
	}

#define BX_SETTER_B( name, engine )                                                                                              \
	BX_EXPORT void bx_##name( int slot, int flag )                                                                               \
	{                                                                                                                            \
		BX_JOINT( slot );                                                                                                        \
		engine( jointId, flag != 0 );                                                                                            \
	}

#define BX_SETTER_FF( name, engine )                                                                                             \
	BX_EXPORT void bx_##name( int slot, float a, float b )                                                                       \
	{                                                                                                                            \
		BX_JOINT( slot );                                                                                                        \
		engine( jointId, a, b );                                                                                                 \
	}

#define BX_GETTER_F( name, engine )                                                                                              \
	BX_EXPORT float bx_##name( int slot )                                                                                        \
	{                                                                                                                            \
		BX_JOINT_RET( slot, 0.0f );                                                                                              \
		return engine( jointId );                                                                                                \
	}

#define BX_GETTER_B( name, engine )                                                                                              \
	BX_EXPORT int bx_##name( int slot )                                                                                          \
	{                                                                                                                            \
		BX_JOINT_RET( slot, 0 );                                                                                                 \
		return engine( jointId );                                                                                                \
	}

// Distance
BX_SETTER_F( DistanceJoint_SetLength, b3DistanceJoint_SetLength )
BX_GETTER_F( DistanceJoint_GetLength, b3DistanceJoint_GetLength )
BX_GETTER_F( DistanceJoint_GetCurrentLength, b3DistanceJoint_GetCurrentLength )
BX_SETTER_B( DistanceJoint_EnableSpring, b3DistanceJoint_EnableSpring )
BX_GETTER_B( DistanceJoint_IsSpringEnabled, b3DistanceJoint_IsSpringEnabled )
BX_SETTER_FF( DistanceJoint_SetSpringForceRange, b3DistanceJoint_SetSpringForceRange )
BX_SETTER_F( DistanceJoint_SetSpringHertz, b3DistanceJoint_SetSpringHertz )
BX_GETTER_F( DistanceJoint_GetSpringHertz, b3DistanceJoint_GetSpringHertz )
BX_SETTER_F( DistanceJoint_SetSpringDampingRatio, b3DistanceJoint_SetSpringDampingRatio )
BX_GETTER_F( DistanceJoint_GetSpringDampingRatio, b3DistanceJoint_GetSpringDampingRatio )
BX_SETTER_B( DistanceJoint_EnableLimit, b3DistanceJoint_EnableLimit )
BX_GETTER_B( DistanceJoint_IsLimitEnabled, b3DistanceJoint_IsLimitEnabled )
BX_SETTER_FF( DistanceJoint_SetLengthRange, b3DistanceJoint_SetLengthRange )
BX_GETTER_F( DistanceJoint_GetMinLength, b3DistanceJoint_GetMinLength )
BX_GETTER_F( DistanceJoint_GetMaxLength, b3DistanceJoint_GetMaxLength )
BX_SETTER_B( DistanceJoint_EnableMotor, b3DistanceJoint_EnableMotor )
BX_GETTER_B( DistanceJoint_IsMotorEnabled, b3DistanceJoint_IsMotorEnabled )
BX_SETTER_F( DistanceJoint_SetMotorSpeed, b3DistanceJoint_SetMotorSpeed )
BX_GETTER_F( DistanceJoint_GetMotorSpeed, b3DistanceJoint_GetMotorSpeed )
BX_SETTER_F( DistanceJoint_SetMaxMotorForce, b3DistanceJoint_SetMaxMotorForce )
BX_GETTER_F( DistanceJoint_GetMaxMotorForce, b3DistanceJoint_GetMaxMotorForce )
BX_GETTER_F( DistanceJoint_GetMotorForce, b3DistanceJoint_GetMotorForce )

// Revolute
BX_GETTER_F( RevoluteJoint_GetAngle, b3RevoluteJoint_GetAngle )
BX_SETTER_B( RevoluteJoint_EnableSpring, b3RevoluteJoint_EnableSpring )
BX_GETTER_B( RevoluteJoint_IsSpringEnabled, b3RevoluteJoint_IsSpringEnabled )
BX_SETTER_F( RevoluteJoint_SetSpringHertz, b3RevoluteJoint_SetSpringHertz )
BX_GETTER_F( RevoluteJoint_GetSpringHertz, b3RevoluteJoint_GetSpringHertz )
BX_SETTER_F( RevoluteJoint_SetSpringDampingRatio, b3RevoluteJoint_SetSpringDampingRatio )
BX_GETTER_F( RevoluteJoint_GetSpringDampingRatio, b3RevoluteJoint_GetSpringDampingRatio )
BX_SETTER_F( RevoluteJoint_SetTargetAngle, b3RevoluteJoint_SetTargetAngle )
BX_GETTER_F( RevoluteJoint_GetTargetAngle, b3RevoluteJoint_GetTargetAngle )
BX_SETTER_B( RevoluteJoint_EnableLimit, b3RevoluteJoint_EnableLimit )
BX_GETTER_B( RevoluteJoint_IsLimitEnabled, b3RevoluteJoint_IsLimitEnabled )
BX_SETTER_FF( RevoluteJoint_SetLimits, b3RevoluteJoint_SetLimits )
BX_GETTER_F( RevoluteJoint_GetLowerLimit, b3RevoluteJoint_GetLowerLimit )
BX_GETTER_F( RevoluteJoint_GetUpperLimit, b3RevoluteJoint_GetUpperLimit )
BX_SETTER_B( RevoluteJoint_EnableMotor, b3RevoluteJoint_EnableMotor )
BX_GETTER_B( RevoluteJoint_IsMotorEnabled, b3RevoluteJoint_IsMotorEnabled )
BX_SETTER_F( RevoluteJoint_SetMotorSpeed, b3RevoluteJoint_SetMotorSpeed )
BX_GETTER_F( RevoluteJoint_GetMotorSpeed, b3RevoluteJoint_GetMotorSpeed )
BX_SETTER_F( RevoluteJoint_SetMaxMotorTorque, b3RevoluteJoint_SetMaxMotorTorque )
BX_GETTER_F( RevoluteJoint_GetMaxMotorTorque, b3RevoluteJoint_GetMaxMotorTorque )
BX_GETTER_F( RevoluteJoint_GetMotorTorque, b3RevoluteJoint_GetMotorTorque )

// Spherical
BX_SETTER_B( SphericalJoint_EnableConeLimit, b3SphericalJoint_EnableConeLimit )
BX_GETTER_B( SphericalJoint_IsConeLimitEnabled, b3SphericalJoint_IsConeLimitEnabled )
BX_SETTER_F( SphericalJoint_SetConeLimit, b3SphericalJoint_SetConeLimit )
BX_GETTER_F( SphericalJoint_GetConeLimit, b3SphericalJoint_GetConeLimit )
BX_GETTER_F( SphericalJoint_GetConeAngle, b3SphericalJoint_GetConeAngle )
BX_SETTER_B( SphericalJoint_EnableTwistLimit, b3SphericalJoint_EnableTwistLimit )
BX_GETTER_B( SphericalJoint_IsTwistLimitEnabled, b3SphericalJoint_IsTwistLimitEnabled )
BX_SETTER_FF( SphericalJoint_SetTwistLimits, b3SphericalJoint_SetTwistLimits )
BX_GETTER_F( SphericalJoint_GetLowerTwistLimit, b3SphericalJoint_GetLowerTwistLimit )
BX_GETTER_F( SphericalJoint_GetUpperTwistLimit, b3SphericalJoint_GetUpperTwistLimit )
BX_GETTER_F( SphericalJoint_GetTwistAngle, b3SphericalJoint_GetTwistAngle )
BX_SETTER_B( SphericalJoint_EnableSpring, b3SphericalJoint_EnableSpring )
BX_GETTER_B( SphericalJoint_IsSpringEnabled, b3SphericalJoint_IsSpringEnabled )
BX_SETTER_F( SphericalJoint_SetSpringHertz, b3SphericalJoint_SetSpringHertz )
BX_GETTER_F( SphericalJoint_GetSpringHertz, b3SphericalJoint_GetSpringHertz )
BX_SETTER_F( SphericalJoint_SetSpringDampingRatio, b3SphericalJoint_SetSpringDampingRatio )
BX_GETTER_F( SphericalJoint_GetSpringDampingRatio, b3SphericalJoint_GetSpringDampingRatio )
BX_SETTER_B( SphericalJoint_EnableMotor, b3SphericalJoint_EnableMotor )
BX_GETTER_B( SphericalJoint_IsMotorEnabled, b3SphericalJoint_IsMotorEnabled )
BX_SETTER_F( SphericalJoint_SetMaxMotorTorque, b3SphericalJoint_SetMaxMotorTorque )
BX_GETTER_F( SphericalJoint_GetMaxMotorTorque, b3SphericalJoint_GetMaxMotorTorque )

BX_EXPORT void bx_SphericalJoint_SetTargetRotation( int slot, float x, float y, float z, float w )
{
	BX_JOINT( slot );
	b3SphericalJoint_SetTargetRotation( jointId, bxQuat( x, y, z, w ) );
}

/// scratch: [x, y, z, w]
BX_EXPORT void bx_SphericalJoint_GetTargetRotation( int slot )
{
	BX_JOINT( slot );
	bxScratchQuat( 0, b3SphericalJoint_GetTargetRotation( jointId ) );
}

BX_EXPORT void bx_SphericalJoint_SetMotorVelocity( int slot, float x, float y, float z )
{
	BX_JOINT( slot );
	b3SphericalJoint_SetMotorVelocity( jointId, bxVec3( x, y, z ) );
}

/// scratch: [x, y, z]
BX_EXPORT void bx_SphericalJoint_GetMotorVelocity( int slot )
{
	BX_JOINT( slot );
	bxScratchVec3( 0, b3SphericalJoint_GetMotorVelocity( jointId ) );
}

/// scratch: [x, y, z]
BX_EXPORT void bx_SphericalJoint_GetMotorTorque( int slot )
{
	BX_JOINT( slot );
	bxScratchVec3( 0, b3SphericalJoint_GetMotorTorque( jointId ) );
}

// Prismatic
BX_GETTER_F( PrismaticJoint_GetTranslation, b3PrismaticJoint_GetTranslation )
BX_GETTER_F( PrismaticJoint_GetSpeed, b3PrismaticJoint_GetSpeed )
BX_SETTER_B( PrismaticJoint_EnableSpring, b3PrismaticJoint_EnableSpring )
BX_GETTER_B( PrismaticJoint_IsSpringEnabled, b3PrismaticJoint_IsSpringEnabled )
BX_SETTER_F( PrismaticJoint_SetSpringHertz, b3PrismaticJoint_SetSpringHertz )
BX_GETTER_F( PrismaticJoint_GetSpringHertz, b3PrismaticJoint_GetSpringHertz )
BX_SETTER_F( PrismaticJoint_SetSpringDampingRatio, b3PrismaticJoint_SetSpringDampingRatio )
BX_GETTER_F( PrismaticJoint_GetSpringDampingRatio, b3PrismaticJoint_GetSpringDampingRatio )
BX_SETTER_F( PrismaticJoint_SetTargetTranslation, b3PrismaticJoint_SetTargetTranslation )
BX_GETTER_F( PrismaticJoint_GetTargetTranslation, b3PrismaticJoint_GetTargetTranslation )
BX_SETTER_B( PrismaticJoint_EnableLimit, b3PrismaticJoint_EnableLimit )
BX_GETTER_B( PrismaticJoint_IsLimitEnabled, b3PrismaticJoint_IsLimitEnabled )
BX_SETTER_FF( PrismaticJoint_SetLimits, b3PrismaticJoint_SetLimits )
BX_GETTER_F( PrismaticJoint_GetLowerLimit, b3PrismaticJoint_GetLowerLimit )
BX_GETTER_F( PrismaticJoint_GetUpperLimit, b3PrismaticJoint_GetUpperLimit )
BX_SETTER_B( PrismaticJoint_EnableMotor, b3PrismaticJoint_EnableMotor )
BX_GETTER_B( PrismaticJoint_IsMotorEnabled, b3PrismaticJoint_IsMotorEnabled )
BX_SETTER_F( PrismaticJoint_SetMotorSpeed, b3PrismaticJoint_SetMotorSpeed )
BX_GETTER_F( PrismaticJoint_GetMotorSpeed, b3PrismaticJoint_GetMotorSpeed )
BX_SETTER_F( PrismaticJoint_SetMaxMotorForce, b3PrismaticJoint_SetMaxMotorForce )
BX_GETTER_F( PrismaticJoint_GetMaxMotorForce, b3PrismaticJoint_GetMaxMotorForce )
BX_GETTER_F( PrismaticJoint_GetMotorForce, b3PrismaticJoint_GetMotorForce )

// Weld
BX_SETTER_F( WeldJoint_SetLinearHertz, b3WeldJoint_SetLinearHertz )
BX_GETTER_F( WeldJoint_GetLinearHertz, b3WeldJoint_GetLinearHertz )
BX_SETTER_F( WeldJoint_SetLinearDampingRatio, b3WeldJoint_SetLinearDampingRatio )
BX_GETTER_F( WeldJoint_GetLinearDampingRatio, b3WeldJoint_GetLinearDampingRatio )
BX_SETTER_F( WeldJoint_SetAngularHertz, b3WeldJoint_SetAngularHertz )
BX_GETTER_F( WeldJoint_GetAngularHertz, b3WeldJoint_GetAngularHertz )
BX_SETTER_F( WeldJoint_SetAngularDampingRatio, b3WeldJoint_SetAngularDampingRatio )
BX_GETTER_F( WeldJoint_GetAngularDampingRatio, b3WeldJoint_GetAngularDampingRatio )

// Motor
BX_SETTER_F( MotorJoint_SetMaxVelocityForce, b3MotorJoint_SetMaxVelocityForce )
BX_GETTER_F( MotorJoint_GetMaxVelocityForce, b3MotorJoint_GetMaxVelocityForce )
BX_SETTER_F( MotorJoint_SetMaxVelocityTorque, b3MotorJoint_SetMaxVelocityTorque )
BX_GETTER_F( MotorJoint_GetMaxVelocityTorque, b3MotorJoint_GetMaxVelocityTorque )
BX_SETTER_F( MotorJoint_SetLinearHertz, b3MotorJoint_SetLinearHertz )
BX_GETTER_F( MotorJoint_GetLinearHertz, b3MotorJoint_GetLinearHertz )
BX_SETTER_F( MotorJoint_SetLinearDampingRatio, b3MotorJoint_SetLinearDampingRatio )
BX_GETTER_F( MotorJoint_GetLinearDampingRatio, b3MotorJoint_GetLinearDampingRatio )
BX_SETTER_F( MotorJoint_SetAngularHertz, b3MotorJoint_SetAngularHertz )
BX_GETTER_F( MotorJoint_GetAngularHertz, b3MotorJoint_GetAngularHertz )
BX_SETTER_F( MotorJoint_SetAngularDampingRatio, b3MotorJoint_SetAngularDampingRatio )
BX_GETTER_F( MotorJoint_GetAngularDampingRatio, b3MotorJoint_GetAngularDampingRatio )
BX_SETTER_F( MotorJoint_SetMaxSpringForce, b3MotorJoint_SetMaxSpringForce )
BX_GETTER_F( MotorJoint_GetMaxSpringForce, b3MotorJoint_GetMaxSpringForce )
BX_SETTER_F( MotorJoint_SetMaxSpringTorque, b3MotorJoint_SetMaxSpringTorque )
BX_GETTER_F( MotorJoint_GetMaxSpringTorque, b3MotorJoint_GetMaxSpringTorque )

BX_EXPORT void bx_MotorJoint_SetLinearVelocity( int slot, float x, float y, float z )
{
	BX_JOINT( slot );
	b3MotorJoint_SetLinearVelocity( jointId, bxVec3( x, y, z ) );
}

/// scratch: [x, y, z]
BX_EXPORT void bx_MotorJoint_GetLinearVelocity( int slot )
{
	BX_JOINT( slot );
	bxScratchVec3( 0, b3MotorJoint_GetLinearVelocity( jointId ) );
}

BX_EXPORT void bx_MotorJoint_SetAngularVelocity( int slot, float x, float y, float z )
{
	BX_JOINT( slot );
	b3MotorJoint_SetAngularVelocity( jointId, bxVec3( x, y, z ) );
}

/// scratch: [x, y, z]
BX_EXPORT void bx_MotorJoint_GetAngularVelocity( int slot )
{
	BX_JOINT( slot );
	bxScratchVec3( 0, b3MotorJoint_GetAngularVelocity( jointId ) );
}

// Wheel
BX_SETTER_B( WheelJoint_EnableSuspension, b3WheelJoint_EnableSuspension )
BX_GETTER_B( WheelJoint_IsSuspensionEnabled, b3WheelJoint_IsSuspensionEnabled )
BX_SETTER_F( WheelJoint_SetSuspensionHertz, b3WheelJoint_SetSuspensionHertz )
BX_GETTER_F( WheelJoint_GetSuspensionHertz, b3WheelJoint_GetSuspensionHertz )
BX_SETTER_F( WheelJoint_SetSuspensionDampingRatio, b3WheelJoint_SetSuspensionDampingRatio )
BX_GETTER_F( WheelJoint_GetSuspensionDampingRatio, b3WheelJoint_GetSuspensionDampingRatio )
BX_SETTER_B( WheelJoint_EnableSuspensionLimit, b3WheelJoint_EnableSuspensionLimit )
BX_GETTER_B( WheelJoint_IsSuspensionLimitEnabled, b3WheelJoint_IsSuspensionLimitEnabled )
BX_SETTER_FF( WheelJoint_SetSuspensionLimits, b3WheelJoint_SetSuspensionLimits )
BX_GETTER_F( WheelJoint_GetLowerSuspensionLimit, b3WheelJoint_GetLowerSuspensionLimit )
BX_GETTER_F( WheelJoint_GetUpperSuspensionLimit, b3WheelJoint_GetUpperSuspensionLimit )
BX_SETTER_B( WheelJoint_EnableSpinMotor, b3WheelJoint_EnableSpinMotor )
BX_GETTER_B( WheelJoint_IsSpinMotorEnabled, b3WheelJoint_IsSpinMotorEnabled )
BX_SETTER_F( WheelJoint_SetSpinMotorSpeed, b3WheelJoint_SetSpinMotorSpeed )
BX_GETTER_F( WheelJoint_GetSpinMotorSpeed, b3WheelJoint_GetSpinMotorSpeed )
BX_SETTER_F( WheelJoint_SetMaxSpinTorque, b3WheelJoint_SetMaxSpinTorque )
BX_GETTER_F( WheelJoint_GetMaxSpinTorque, b3WheelJoint_GetMaxSpinTorque )
BX_GETTER_F( WheelJoint_GetSpinSpeed, b3WheelJoint_GetSpinSpeed )
BX_GETTER_F( WheelJoint_GetSpinTorque, b3WheelJoint_GetSpinTorque )
BX_SETTER_B( WheelJoint_EnableSteering, b3WheelJoint_EnableSteering )
BX_GETTER_B( WheelJoint_IsSteeringEnabled, b3WheelJoint_IsSteeringEnabled )
BX_SETTER_F( WheelJoint_SetSteeringHertz, b3WheelJoint_SetSteeringHertz )
BX_GETTER_F( WheelJoint_GetSteeringHertz, b3WheelJoint_GetSteeringHertz )
BX_SETTER_F( WheelJoint_SetSteeringDampingRatio, b3WheelJoint_SetSteeringDampingRatio )
BX_GETTER_F( WheelJoint_GetSteeringDampingRatio, b3WheelJoint_GetSteeringDampingRatio )
BX_SETTER_F( WheelJoint_SetMaxSteeringTorque, b3WheelJoint_SetMaxSteeringTorque )
BX_GETTER_F( WheelJoint_GetMaxSteeringTorque, b3WheelJoint_GetMaxSteeringTorque )
BX_SETTER_B( WheelJoint_EnableSteeringLimit, b3WheelJoint_EnableSteeringLimit )
BX_GETTER_B( WheelJoint_IsSteeringLimitEnabled, b3WheelJoint_IsSteeringLimitEnabled )
BX_SETTER_FF( WheelJoint_SetSteeringLimits, b3WheelJoint_SetSteeringLimits )
BX_GETTER_F( WheelJoint_GetLowerSteeringLimit, b3WheelJoint_GetLowerSteeringLimit )
BX_GETTER_F( WheelJoint_GetUpperSteeringLimit, b3WheelJoint_GetUpperSteeringLimit )
BX_SETTER_F( WheelJoint_SetTargetSteeringAngle, b3WheelJoint_SetTargetSteeringAngle )
BX_GETTER_F( WheelJoint_GetTargetSteeringAngle, b3WheelJoint_GetTargetSteeringAngle )
BX_GETTER_F( WheelJoint_GetSteeringAngle, b3WheelJoint_GetSteeringAngle )
BX_GETTER_F( WheelJoint_GetSteeringTorque, b3WheelJoint_GetSteeringTorque )

// Parallel
BX_SETTER_F( ParallelJoint_SetSpringHertz, b3ParallelJoint_SetSpringHertz )
BX_GETTER_F( ParallelJoint_GetSpringHertz, b3ParallelJoint_GetSpringHertz )
BX_SETTER_F( ParallelJoint_SetSpringDampingRatio, b3ParallelJoint_SetSpringDampingRatio )
BX_GETTER_F( ParallelJoint_GetSpringDampingRatio, b3ParallelJoint_GetSpringDampingRatio )
BX_SETTER_F( ParallelJoint_SetMaxTorque, b3ParallelJoint_SetMaxTorque )
BX_GETTER_F( ParallelJoint_GetMaxTorque, b3ParallelJoint_GetMaxTorque )
