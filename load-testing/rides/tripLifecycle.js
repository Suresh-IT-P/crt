const TripStates = {
  REQUESTED: 'requested',
  MATCHING: 'matching',
  ASSIGNED: 'assigned',
  DRIVER_ARRIVED: 'arrived',
  STARTED: 'started',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled'
};

class TripLifecycleTracker {
  constructor() {
    this.activeTrips = new Map();
  }

  createTrip(rideId, customerId) {
    this.activeTrips.set(rideId, {
      rideId,
      customerId,
      driverId: null,
      status: TripStates.REQUESTED,
      createdAt: Date.now()
    });
  }

  assignDriver(rideId, driverId) {
    const trip = this.activeTrips.get(rideId);
    if (trip) {
      trip.driverId = driverId;
      trip.status = TripStates.ASSIGNED;
    }
  }

  updateStatus(rideId, status) {
    const trip = this.activeTrips.get(rideId);
    if (trip) {
      trip.status = status;
      if (status === TripStates.COMPLETED || status === TripStates.CANCELLED) {
        this.activeTrips.delete(rideId);
      }
    }
  }

  getActiveTripsCount() {
    return this.activeTrips.size;
  }
}

module.exports = {
  TripStates,
  TripLifecycleTracker
};
