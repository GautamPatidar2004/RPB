import { createSlice } from '@reduxjs/toolkit';

const authSlice = createSlice({
  name: 'auth',
  initialState: { user: { role: 'Planner', fullName: 'Rajesh Sharma' }, isAuthenticated: true },
  reducers: {}
});

export default authSlice.reducer;
